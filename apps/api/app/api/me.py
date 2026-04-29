"""GET /api/auth/me — 拿目前登入者資訊。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUserDep
from app.schemas.api import ApiResponse
from app.schemas.auth import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=ApiResponse[UserOut])
async def get_me(user: CurrentUserDep) -> ApiResponse[UserOut]:
    return ApiResponse[UserOut].ok(UserOut.model_validate(user))
