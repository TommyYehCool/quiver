"""Unit tests for the F-Phase 3 write paths added to BitfinexFundingAdapter.

We mock httpx with respx so no real Bitfinex calls are made. Coverage focus:
- HMAC signature header is present + nonce header is present (sanity)
- Each write method correctly parses Bitfinex's positional-array responses
- Error responses raise (so callers won't silently treat failures as success)
- Edge cases: invalid period_days, non-positive amount
"""

from __future__ import annotations

from decimal import Decimal

import httpx
import pytest
import respx

from app.services.earn.bitfinex_adapter import (
    API_BASE,
    BitfinexFundingAdapter,
    FundingDepositAddress,
    FundingOffer,
)


@pytest.fixture
def adapter() -> BitfinexFundingAdapter:
    return BitfinexFundingAdapter(api_key="test-key", api_secret="test-secret")


# ──── get_funding_deposit_address ────


@pytest.mark.asyncio
@respx.mock
async def test_get_funding_deposit_address_success(adapter: BitfinexFundingAdapter) -> None:
    # Bitfinex shape:
    # [MTS, TYPE, MSG_ID, null, [_, CURR, METHOD, _, _, _, _, _, _, _, _, _,
    #                            AMOUNT, FEES, _, _, ADDRESS, POOL_ADDRESS, ...],
    #  CODE, STATUS, TEXT]
    inner = [None, "USDTX", "tetherusx", None, None, None, None, None, None, None, None, None,
             0, 0, None, None, "TXXXyourBitfinexFundingAddress12345678", None]
    route = respx.post(f"{API_BASE}/v2/auth/w/deposit/address").mock(
        return_value=httpx.Response(200, json=[1.0, "deposit", 1, None, inner, None, "SUCCESS", "ok"])
    )
    result = await adapter.get_funding_deposit_address()
    assert isinstance(result, FundingDepositAddress)
    assert result.address == "TXXXyourBitfinexFundingAddress12345678"
    assert result.method == "tetherusx"
    # Sanity: signature + nonce headers present
    request = route.calls.last.request
    assert request.headers["bfx-apikey"] == "test-key"
    assert request.headers["bfx-signature"]  # non-empty
    assert request.headers["bfx-nonce"]      # non-empty


@pytest.mark.asyncio
@respx.mock
async def test_get_funding_deposit_address_error_raises(adapter: BitfinexFundingAdapter) -> None:
    respx.post(f"{API_BASE}/v2/auth/w/deposit/address").mock(
        return_value=httpx.Response(200, json=[1.0, "deposit", 1, None, None, "10001", "ERROR", "permission denied"])
    )
    with pytest.raises(ValueError, match="ERROR"):
        await adapter.get_funding_deposit_address()


# ──── submit_funding_offer ────


@pytest.mark.asyncio
@respx.mock
async def test_submit_funding_offer_success(adapter: BitfinexFundingAdapter) -> None:
    offer_data = [12345678]  # OFFER_DATA[0] = id; rest of array doesn't matter for our parsing
    respx.post(f"{API_BASE}/v2/auth/w/funding/offer/submit").mock(
        return_value=httpx.Response(200, json=[1.0, "fon-req", 1, None, offer_data, None, "SUCCESS", "ok"])
    )
    offer_id = await adapter.submit_funding_offer(amount=Decimal("150"), period_days=2)
    assert offer_id == 12345678


@pytest.mark.asyncio
async def test_submit_funding_offer_invalid_period_raises(adapter: BitfinexFundingAdapter) -> None:
    with pytest.raises(ValueError, match="period_days"):
        await adapter.submit_funding_offer(amount=Decimal("150"), period_days=1)
    with pytest.raises(ValueError, match="period_days"):
        await adapter.submit_funding_offer(amount=Decimal("150"), period_days=31)


@pytest.mark.asyncio
async def test_submit_funding_offer_non_positive_amount_raises(adapter: BitfinexFundingAdapter) -> None:
    with pytest.raises(ValueError, match="amount"):
        await adapter.submit_funding_offer(amount=Decimal("0"), period_days=2)


@pytest.mark.asyncio
@respx.mock
async def test_submit_funding_offer_error_raises(adapter: BitfinexFundingAdapter) -> None:
    respx.post(f"{API_BASE}/v2/auth/w/funding/offer/submit").mock(
        return_value=httpx.Response(200, json=[1.0, "fon-req", 1, None, None, "10020", "ERROR", "amount: invalid"])
    )
    with pytest.raises(ValueError, match="ERROR"):
        await adapter.submit_funding_offer(amount=Decimal("150"), period_days=2)


# ──── cancel_funding_offer ────


@pytest.mark.asyncio
@respx.mock
async def test_cancel_funding_offer_success(adapter: BitfinexFundingAdapter) -> None:
    respx.post(f"{API_BASE}/v2/auth/w/funding/offer/cancel").mock(
        return_value=httpx.Response(200, json=[1.0, "foc-req", 1, None, [12345678], None, "SUCCESS", "ok"])
    )
    # Should not raise
    await adapter.cancel_funding_offer(12345678)


@pytest.mark.asyncio
@respx.mock
async def test_cancel_funding_offer_already_matched_raises(adapter: BitfinexFundingAdapter) -> None:
    respx.post(f"{API_BASE}/v2/auth/w/funding/offer/cancel").mock(
        return_value=httpx.Response(200, json=[1.0, "foc-req", 1, None, None, "10010", "ERROR", "offer not found"])
    )
    with pytest.raises(ValueError, match="ERROR"):
        await adapter.cancel_funding_offer(12345678)


# ──── list_active_offers ────


@pytest.mark.asyncio
@respx.mock
async def test_list_active_offers_parses_rows(adapter: BitfinexFundingAdapter) -> None:
    # Each row: [ID, SYMBOL, MTS_CREATE, MTS_UPDATE, AMOUNT, AMOUNT_ORIG, TYPE,
    #            _, _, FLAGS, STATUS, _, _, _, RATE, PERIOD, ...]
    rows = [
        [111, "fUST", 1700000000000, 1700000000000, 150.0, 150.0, "LIMIT",
         None, None, 0, "ACTIVE", None, None, None, 0.0001, 2],
        [222, "fUST", 1700000001000, 1700000001000, 50.5,  100.0, "LIMIT",
         None, None, 16, "PARTIALLY FILLED", None, None, None, 0.0002, 7],
    ]
    respx.post(f"{API_BASE}/v2/auth/r/funding/offers/fUST").mock(
        return_value=httpx.Response(200, json=rows)
    )
    offers = await adapter.list_active_offers()
    assert len(offers) == 2
    assert offers[0] == FundingOffer(id=111, symbol="fUST", amount=Decimal("150.0"),
                                     rate=Decimal("0.0001"), period=2, flags=0)
    assert offers[1].id == 222
    assert offers[1].period == 7
    assert offers[1].flags == 16


@pytest.mark.asyncio
@respx.mock
async def test_list_active_offers_skips_malformed_rows(adapter: BitfinexFundingAdapter) -> None:
    rows = [
        [111, "fUST", 1700000000000, 1700000000000, 150.0, 150.0, "LIMIT",
         None, None, 0, "ACTIVE", None, None, None, 0.0001, 2],
        ["short", "row"],  # malformed, should be skipped
        None,              # not a list, should be skipped
    ]
    respx.post(f"{API_BASE}/v2/auth/r/funding/offers/fUST").mock(
        return_value=httpx.Response(200, json=rows)
    )
    offers = await adapter.list_active_offers()
    assert len(offers) == 1
    assert offers[0].id == 111


@pytest.mark.asyncio
@respx.mock
async def test_list_active_offers_empty(adapter: BitfinexFundingAdapter) -> None:
    respx.post(f"{API_BASE}/v2/auth/r/funding/offers/fUST").mock(
        return_value=httpx.Response(200, json=[])
    )
    offers = await adapter.list_active_offers()
    assert offers == []
