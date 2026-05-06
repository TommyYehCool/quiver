/**
 * Guide ④ — Strategy presets + ladder explained.
 *
 * Backstory: real user (Tommy) saw 2.92% APR on a 2-day loan with $200
 * deposited and asked "下一筆會好一點嗎?" The honest answer revealed
 * that with $200 the ladder doesn't even activate (Balanced needs $5K).
 * This page makes the implicit logic visible so users can self-diagnose
 * "why am I getting low rates" and decide whether to size up or just
 * wait for the next rate spike.
 *
 * Numbers here MUST stay in sync with apps/api/app/services/earn/auto_lend.py:
 *   - LADDER_TRANCHES_{CONSERVATIVE,BALANCED,AGGRESSIVE}
 *   - PERIOD_RATE_THRESHOLDS_APR_{CONSERVATIVE,BALANCED,AGGRESSIVE}
 *   - MIN_AUTO_LEND_USDT (= 150)
 * If you change those constants, update the tables here too.
 */

import Link from "next/link";
import { ArrowLeft, ArrowRight, Layers, Lightbulb, Shield, Zap } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Locale = "zh-TW" | "en" | "ja";

interface PresetRow {
  name: string;
  icon: "shield" | "scales" | "zap";
  ladderMin: string;
  baseFraction: string;
  topTranche: string;
  maxLockDays: string;
  bestFor: string;
}

interface LadderRow {
  pct: string;
  amount: string;
  multiplier: string;
  resultRate: string;
  period: string;
  note: string;
}

interface Strings {
  back: string;
  title: string;
  subtitle: string;

  // section 1: real example
  s1: {
    h: string;
    body: string;
    bullets: string[];
    insight: string;
  };

  // section 2: how laddering works
  s2: {
    h: string;
    lead: string;
    body: string;
    columns: { pct: string; amount: string; multiplier: string; rate: string; period: string; note: string };
    rows: LadderRow[];
    avgLine: string;
    avgValue: string;
    avgNote: string;
  };

  // section 3: preset comparison
  s3: {
    h: string;
    lead: string;
    columns: { name: string; ladderMin: string; baseFraction: string; topTranche: string; maxLockDays: string; bestFor: string };
    rows: PresetRow[];
  };

  // section 4: practical advice
  s4: {
    h: string;
    items: { title: string; body: string }[];
  };

  // section 5: faq
  s5: {
    h: string;
    items: { q: string; a: string }[];
  };

  ctaPrimary: string;
  ctaSecondary: string;
}

const STRINGS: Record<Locale, Strings> = {
  "zh-TW": {
    back: "回教學首頁",
    title: "④ 策略類型 + 階梯掛單完整說明",
    subtitle:
      "保守 / 平衡 / 進取 到底差在哪？階梯怎麼切？為什麼有時候你的策略「沒生效」？用一個實際例子拆給你看。",

    s1: {
      h: "先講一個常見問題",
      body: '用戶 A 存了 $200 USDT，選平衡策略。\n結果在 Bitfinex 上只看到一筆「$200 全押、2 天、年化 2.92%」的掛單。\n他問：「我選了平衡的 5 階階梯，怎麼只看到 1 筆？」',
      bullets: [
        "答案：他的階梯**根本沒啟動**",
        "平衡策略最後一階(極端飆漲)只佔 3%，Bitfinex 規定每筆掛單最少 $150",
        "階梯啟動門檻 = 150 ÷ 0.03 = **$5,000**",
        "$200 < $5,000 → 系統靜默退回(沒有提示)成「單一掛單」模式",
      ],
      insight:
        "這不是缺陷，是設計上的權衡。\nBitfinex 平台規定每筆掛單最少 $150，如果硬切 5 階，\n小資金每階只有幾十塊，Bitfinex 會直接拒收。\n所以 Quiver 在資金不夠時會自動退回單一掛單。\n但介面沒告訴你這件事，這是個待修的使用體驗問題，已經紀錄在 backlog 的 F-5a-3.6。",
    },

    s2: {
      h: "階梯真的啟動時長什麼樣子？",
      lead: "假設你選平衡策略，資金有 $5,000，目前市場基礎年化 2.92%，Quiver 會把你的 $5,000 切成 5 階：",
      body: "每階用不同利率掛單。\n基礎那檔 1.0×(就是基礎利率)會最快被借走；\n後面幾階加價等「利率飆漲事件」(BTC 突然大漲大跌、有人爆倉急著借錢)。\n沒飆漲就掛在那邊不成交，等就是了。",
      columns: {
        pct: "佔比",
        amount: "金額",
        multiplier: "倍率",
        rate: "結果年化",
        period: "鎖定天數",
        note: "用途",
      },
      rows: [
        { pct: "60%", amount: "$3,000", multiplier: "1.0×", resultRate: "2.92%", period: "2 天", note: "基礎(快速成交)" },
        { pct: "20%", amount: "$1,000", multiplier: "1.2×", resultRate: "3.50%", period: "2 天", note: "輕度飆漲" },
        { pct: "10%", amount: "$500", multiplier: "1.5×", resultRate: "4.38%", period: "2 天", note: "中度飆漲" },
        { pct: "7%", amount: "$350", multiplier: "2.0×", resultRate: "5.84%", period: "7 天 ★", note: "重度飆漲(超過 5% 鎖長)" },
        { pct: "3%", amount: "$150", multiplier: "4.0×", resultRate: "11.68%", period: "14 天 ★★", note: "極端事件(爆倉潮)" },
      ],
      avgLine: "整體加權平均",
      avgValue: "≈ 年化 3.41%",
      avgNote:
        "比單一掛單的 2.92% 多 0.49%，而且這還沒算「飆漲真的發生時」後面幾階吃到 5-12% 的額外收益。\n階梯的真正價值在最後那兩階：平常掛在那邊不動，等到一個爆倉潮就直接吃到飆漲價，\n而且鎖長 7-14 天，等市場冷靜後你還在賺高利。",
    },

    s3: {
      h: "三個策略類型真正的差別",
      lead: "階梯啟動門檻不一樣 + 資金分配不一樣 + 鎖定上限不一樣。三個維度同時在動。",
      columns: {
        name: "策略",
        ladderMin: "階梯啟動門檻",
        baseFraction: "基礎那檔比例",
        topTranche: "最高飆漲檔",
        maxLockDays: "最大鎖定天數",
        bestFor: "適合誰",
      },
      rows: [
        {
          name: "保守",
          icon: "shield",
          ladderMin: "$3,000",
          baseFraction: "80%",
          topTranche: "1.5× × 5%",
          maxLockDays: "7 天",
          bestFor: "想隨時可取錢、不想鎖長",
        },
        {
          name: "平衡(預設)",
          icon: "scales",
          ladderMin: "$5,000",
          baseFraction: "60%",
          topTranche: "4.0× × 3%",
          maxLockDays: "30 天",
          bestFor: "兼顧成交速度與飆漲收益",
        },
        {
          name: "進取",
          icon: "zap",
          ladderMin: "$1,875",
          baseFraction: "40%",
          topTranche: "4.0× × 8%",
          maxLockDays: "60 天",
          bestFor: "願意鎖長換大飆漲收益",
        },
      ],
    },

    s4: {
      h: "對你的具體建議",
      items: [
        {
          title: "餘額 < $1,875",
          body: "選哪個策略類型結果都一樣，都走單一掛單。\n在冷市場(年化 < 5%)會掛 2 天、熱市場才會自動鎖長。要看到策略真正的差異，先想辦法讓餘額過門檻。",
        },
        {
          title: "餘額 $1,875 ~ $3,000",
          body: "**只有進取會啟動階梯**(因為門檻最低)。\n如果你想體驗 5 階階梯，選進取。但要知道，進取會把 35% 資金壓在 ≥ 1.5× 的飆漲檔，平常時段成交比較慢。",
        },
        {
          title: "餘額 $3,000 ~ $5,000",
          body: "保守和進取都能啟動階梯，平衡還不行。\n如果想要平衡的「6 / 2 / 1 / 0.7 / 0.3 五階」，需要再加碼到 $5,000。",
        },
        {
          title: "餘額 ≥ $5,000",
          body: "三個策略類型都能完整啟動階梯，可以照風險偏好挑。\n預設平衡就是最標準的選擇，6 成快進場、3.4 成等飆漲，最長鎖 30 天。",
        },
        {
          title: "市場很冷時(像現在 ~3% 年化)",
          body: "**不要為了「看起來在做事」而切到進取或鎖長**。\n冷市場切長期 = 把當下的爛價鎖住，等明天市場熱了你還是賺 2.92%。\nQuiver 預設 2 天期就是要在冷市場保留快速重新議價的彈性。",
        },
      ],
    },

    s5: {
      h: "常見問答",
      items: [
        {
          q: "我換策略類型，目前在借的掛單會立刻改嗎？",
          a: "不會。\n已成交的掛單會跑完當前期(2 ~ 30 天不等)，到期回到 Bitfinex 的 Funding 錢包後，下一輪自動放貸才會用新策略計算。",
        },
        {
          q: "為什麼基礎那檔都 1.0×？Quiver 怎麼決定基礎利率？",
          a: "基礎那檔送的是 Bitfinex 的「FRR 市場單」(rate=None)，意思是「以當下 FRR 自動撮合」，FRR 是 Bitfinex 對所有 funding 利率的動態加權平均。\n這種單在 Bitfinex 撮合引擎有優先序(借款人預設選 FRR pool)，所以成交速度快又永遠拿到 FRR 公允價，不會被掛得比 FRR 還便宜。高階(1.2× / 1.5× / 2× / 4×)那幾檔則用固定價掛在 FRR 之上，等飆漲行情。",
        },
        {
          q: "高飆漲檔(1.5× / 2× / 4×)如果一直沒成交，我是不是少賺了？",
          a: "嚴格說是。\n但這是有意識的取捨，那幾檔是「等爆倉潮」用的保險。冷市場大部分時候不會中，但中一次抵很多次基礎檔的收益。如果你完全不想賭飆漲、想要每筆都成交，選保守(80% 在基礎、5% 在最高)。",
        },
        {
          q: "鎖定 30 / 60 天的單，我中途想用錢怎麼辦？",
          a: "已經被借走的部分必須等到期(這是 Bitfinex 規則，Quiver 動不了)。\n所以選進取前要想清楚，如果你 1 個月內可能要動到錢，選保守(最大 7 天)比較合適。",
        },
      ],
    },

    ctaPrimary: "回教學首頁 →",
    ctaSecondary: "去 /earn 看我目前在哪個策略 →",
  },

  en: {
    back: "Back to guide hub",
    title: "④ Strategy Presets + Ladder Explained",
    subtitle:
      "What's actually different between Conservative / Balanced / Aggressive? How does the ladder work? Why does your strategy sometimes 'not take effect'? Let's walk through a real example.",

    s1: {
      h: "Start with a common question",
      body: 'A user deposited $200 USDT, picked Balanced, and saw a single $200 / 2-day / 2.92% APR offer on Bitfinex. They asked: "I picked the 5-tier Balanced ladder — why do I only see one offer?"',
      bullets: [
        "Answer: their ladder **never activated**",
        "Balanced's smallest tranche (extreme spike) is only 3% of total. Bitfinex requires each offer to be ≥ $150",
        "→ Ladder activation threshold = 150 ÷ 0.03 = **$5,000**",
        "$200 < $5,000 → system silently falls back to single-offer mode",
      ],
      insight:
        "This isn't a bug, it's a tradeoff. Bitfinex's $150-per-offer minimum means slicing $200 into 5 tranches would mean ~$40 chunks, which Bitfinex rejects. So Quiver auto-falls-back to a single offer when funds are too small. But the UI doesn't tell you this happened (a known UX gap on the fix list).",
    },

    s2: {
      h: "What does an actual ladder look like?",
      lead: "Suppose you're on Balanced with $5,000 and the current market base APR is 2.92%. Quiver splits your $5,000 into 5 tranches:",
      body: "Each tranche posts at a different rate. The 1.0× base tranche fills fastest. Higher tranches sit waiting for 'spike events' — sudden BTC moves, liquidation cascades, anyone willing to pay up to borrow. No spike means they just stay unfilled, which is fine.",
      columns: {
        pct: "Share",
        amount: "Amount",
        multiplier: "Multiplier",
        rate: "Result APR",
        period: "Lock days",
        note: "Purpose",
      },
      rows: [
        { pct: "60%", amount: "$3,000", multiplier: "1.0×", resultRate: "2.92%", period: "2 days", note: "Baseline (fast fill)" },
        { pct: "20%", amount: "$1,000", multiplier: "1.2×", resultRate: "3.50%", period: "2 days", note: "Mild spike capture" },
        { pct: "10%", amount: "$500", multiplier: "1.5×", resultRate: "4.38%", period: "2 days", note: "Moderate spike" },
        { pct: "7%", amount: "$350", multiplier: "2.0×", resultRate: "5.84%", period: "7 days ★", note: "Major spike (locks long >5%)" },
        { pct: "3%", amount: "$150", multiplier: "4.0×", resultRate: "11.68%", period: "14 days ★★", note: "Extreme event (liquidation cascade)" },
      ],
      avgLine: "Weighted average",
      avgValue: "≈ 3.41% APR",
      avgNote:
        "0.49% better than single-offer 2.92% — and that's without counting the bonus when a spike actually fires and the high tranches grab 5-12%. The real value of the ladder is in those last two tranches: they sit dormant most of the time, then capture the spike AND lock that high rate for 7-14 days, so you keep earning premium long after the market normalizes.",
    },

    s3: {
      h: "What actually differs between presets",
      lead: "Three things change at once: ladder activation threshold, allocation across tranches, and max lock-up days.",
      columns: {
        name: "Preset",
        ladderMin: "Ladder threshold",
        baseFraction: "Baseline share",
        topTranche: "Top spike tranche",
        maxLockDays: "Max lock days",
        bestFor: "Best for",
      },
      rows: [
        {
          name: "Conservative",
          icon: "shield",
          ladderMin: "$3,000",
          baseFraction: "80%",
          topTranche: "1.5× × 5%",
          maxLockDays: "7 days",
          bestFor: "Prioritize liquidity, don't want to lock long",
        },
        {
          name: "Balanced (default)",
          icon: "scales",
          ladderMin: "$5,000",
          baseFraction: "60%",
          topTranche: "4.0× × 3%",
          maxLockDays: "30 days",
          bestFor: "Balance fill speed with spike capture",
        },
        {
          name: "Aggressive",
          icon: "zap",
          ladderMin: "$1,875",
          baseFraction: "40%",
          topTranche: "4.0× × 8%",
          maxLockDays: "60 days",
          bestFor: "Willing to lock long for bigger spike yield",
        },
      ],
    },

    s4: {
      h: "Concrete advice for you",
      items: [
        {
          title: "Balance < $1,875",
          body: "Preset doesn't matter — you'll always get single-offer mode. Cold market (<5% APR) → 2-day lock; hot market auto-locks longer. To see preset differences, get the balance over the threshold first.",
        },
        {
          title: "$1,875 – $3,000",
          body: "**Only Aggressive activates the ladder** (lowest threshold). Pick Aggressive if you want to experience 5 tranches. Tradeoff: 35% of funds sit in ≥1.5× tranches, so cold-market fills are slower.",
        },
        {
          title: "$3,000 – $5,000",
          body: "Conservative and Aggressive can ladder; Balanced still can't. To get Balanced's 60/20/10/7/3 split you need to top up to $5K.",
        },
        {
          title: "Balance ≥ $5,000",
          body: "All three presets can ladder fully — pick by risk appetite. Default Balanced is the vanilla choice: 60% fast-fill, 40% spike-waiting, 30-day max lock.",
        },
        {
          title: "Cold market (like now at ~3% APR)",
          body: "**Don't switch to Aggressive or longer locks just to feel productive.** Locking long during a cold market = locking in bad rates — when the market heats up tomorrow you're still earning 2.92%. The default 2-day period exists exactly to keep reprice flexibility.",
        },
      ],
    },

    s5: {
      h: "FAQ",
      items: [
        {
          q: "If I switch presets, do my current offers change immediately?",
          a: "No. Active offers run their full period (2-30 days). When they mature and return to the funding wallet, the next auto_lend cycle uses the new preset.",
        },
        {
          q: "Why is the baseline always 1.0×? How does Quiver pick the base rate?",
          a: "The base tranche is submitted as a Bitfinex \"FRR market order\" (rate=None) — meaning \"auto-match at the current FRR\". FRR is Bitfinex's dynamically-weighted average of all active funding rates. These orders get matching priority on the platform (borrowers default to the FRR pool), so they fill fast at the fair market rate without ever underbidding. Higher tranches (1.2× / 1.5× / 2× / 4×) are posted as fixed-rate offers above FRR, waiting for spike events.",
        },
        {
          q: "If the high spike tranches (1.5× / 2× / 4×) never fill, am I leaving money on the table?",
          a: "Strictly yes. But it's an intentional tradeoff — those tranches are insurance against liquidation cascades. Most of the time they don't trigger; when one does, it makes up for many cycles of base. If you don't want the spike bet at all, pick Conservative (80% baseline, 5% top tranche).",
        },
        {
          q: "If I lock a 30 / 60 day offer and need the cash mid-period, what happens?",
          a: "Already-filled portions must wait until maturity (Bitfinex rule, Quiver can't override). So before picking Aggressive, think about your liquidity — if you might need the cash within a month, Conservative (max 7 days) is safer.",
        },
      ],
    },

    ctaPrimary: "Back to guide hub →",
    ctaSecondary: "Check my current preset on /earn →",
  },

  ja: {
    back: "ガイドトップに戻る",
    title: "④ 戦略プリセット + ラダー(階段オファー)完全解説",
    subtitle:
      "保守 / バランス / アグレッシブの本当の違いは?ラダーはどう機能するのか?なぜ時々、戦略が「効いていない」ように見えるのか?実例で解説します。",

    s1: {
      h: "よくある質問から",
      body: 'あるユーザーが $200 USDT を入金し、バランスを選択。Bitfinex 上には「$200 全額・2 日・APR 2.92%」のオファーが 1 件のみ表示されました。彼は尋ねました:「バランスの 5 段階ラダーを選んだのに、なぜ 1 件しか見えないの?」',
      bullets: [
        "答え:彼のラダーは **そもそも起動していない**",
        "バランスの最後の段(極端な金利急騰用)は全体の 3%。Bitfinex は 1 オファー最低 $150 を要求",
        "→ ラダー起動閾値 = 150 ÷ 0.03 = **$5,000**",
        "$200 < $5,000 → システムは通知なく「単一オファー」モードに切り替え",
      ],
      insight:
        "これはバグではなく、設計上のトレードオフです。Bitfinex の「1 オファー最低 $150」というルールの下で、$200 を 5 段階に切ると各段 ~$40 となり拒否されます。そのため Quiver は資金不足時に単一オファーへ自動切り替え。ただし UI はそれを伝えていません — 既知の UX 改善項目で、バックログの F-5a-3.6 として記録済みです。",
    },

    s2: {
      h: "ラダーが実際に起動するとどう見える?",
      lead: "バランス + $5,000、現在の市場の基準金利が年率 2.92% の場合、Quiver は $5,000 を 5 段階に分割します:",
      body: "各段は異なる金利でオファーを掲示。基礎の 1.0×(これが基準金利)が最速で約定。上の段は「金利急騰イベント」(BTC の急変動、清算カスケードなど)を待ちます。急騰が来なければ約定しないだけで、それでも問題ありません。",
      columns: {
        pct: "比率",
        amount: "金額",
        multiplier: "倍率",
        rate: "結果 APR",
        period: "ロック日数",
        note: "用途",
      },
      rows: [
        { pct: "60%", amount: "$3,000", multiplier: "1.0×", resultRate: "2.92%", period: "2 日", note: "基礎(高速約定)" },
        { pct: "20%", amount: "$1,000", multiplier: "1.2×", resultRate: "3.50%", period: "2 日", note: "軽度の急騰捕捉" },
        { pct: "10%", amount: "$500", multiplier: "1.5×", resultRate: "4.38%", period: "2 日", note: "中度の急騰" },
        { pct: "7%", amount: "$350", multiplier: "2.0×", resultRate: "5.84%", period: "7 日 ★", note: "重度の急騰(5% 超で長期ロック)" },
        { pct: "3%", amount: "$150", multiplier: "4.0×", resultRate: "11.68%", period: "14 日 ★★", note: "極端事件(清算カスケード)" },
      ],
      avgLine: "加重平均",
      avgValue: "≈ 年率 3.41%",
      avgNote:
        "単一オファーの 2.92% より +0.49%。急騰が実際に発生した際に上位段が 5-12% を取る追加収益は別途加算されます。ラダーの真価は最後の 2 段 — 普段は静かに待機し、清算カスケードが来た瞬間に高金利を捕捉して 7-14 日ロック。市場が落ち着いた後も高利を稼ぎ続けます。",
    },

    s3: {
      h: "3 つの戦略プリセットの本当の違い",
      lead: "3 つの軸が同時に変わります:ラダー起動閾値、各段の配分、最大ロック日数。",
      columns: {
        name: "プリセット",
        ladderMin: "ラダー起動閾値",
        baseFraction: "基礎段の比率",
        topTranche: "最高急騰段",
        maxLockDays: "最大ロック日",
        bestFor: "向く人",
      },
      rows: [
        {
          name: "保守",
          icon: "shield",
          ladderMin: "$3,000",
          baseFraction: "80%",
          topTranche: "1.5× × 5%",
          maxLockDays: "7 日",
          bestFor: "流動性重視、長期ロックを避けたい",
        },
        {
          name: "バランス(既定)",
          icon: "scales",
          ladderMin: "$5,000",
          baseFraction: "60%",
          topTranche: "4.0× × 3%",
          maxLockDays: "30 日",
          bestFor: "約定速度と急騰収益の両立",
        },
        {
          name: "アグレッシブ",
          icon: "zap",
          ladderMin: "$1,875",
          baseFraction: "40%",
          topTranche: "4.0× × 8%",
          maxLockDays: "60 日",
          bestFor: "長期ロックを許容して大きな急騰収益を狙う",
        },
      ],
    },

    s4: {
      h: "あなたへの具体的アドバイス",
      items: [
        {
          title: "残高 < $1,875",
          body: "どのプリセットを選んでも結果は同じ — すべて単一オファーになります。冷えた市場(年率 < 5%)では 2 日、熱い市場では自動的に長期ロックされます。プリセットの違いを体感するには、まず閾値を超えるよう増やしてください。",
        },
        {
          title: "$1,875 ~ $3,000",
          body: "**アグレッシブのみラダーが起動します**(閾値が最も低いため)。5 段階ラダーを体感したいならアグレッシブ。ただし 35% を ≥ 1.5× の急騰段に置くため、平常時の約定は遅めになります。",
        },
        {
          title: "$3,000 ~ $5,000",
          body: "保守とアグレッシブはラダー起動可能、バランスはまだ不可。バランスの「60 / 20 / 10 / 7 / 3 五段」を使いたければ $5,000 まで増やしてください。",
        },
        {
          title: "残高 ≥ $5,000",
          body: "3 つのプリセットすべてでラダーが完全起動可能 — リスク選好で選んでください。既定のバランスが最も標準的な選択:60% 高速約定、40% 急騰待機、最大 30 日ロック。",
        },
        {
          title: "市場が冷えている時(現在 年率 ~3%)",
          body: "**「何かしている感」のためにアグレッシブや長期ロックに切り替えてはいけません**。冷えた市場で長期ロック = 悪い金利を固定。明日市場が熱くなっても 2.92% のまま。既定の 2 日期間は、冷えた市場で素早く再価格付けする柔軟性を保つためにあります。",
        },
      ],
    },

    s5: {
      h: "よくある質問",
      items: [
        {
          q: "プリセットを変えると、現在借出中のオファーはすぐ変わりますか?",
          a: "いいえ。約定済みオファーは満期まで(2 ~ 30 日)継続します。満期後に Bitfinex の Funding ウォレットに戻った時、次回の自動貸付サイクルで新プリセットが適用されます。",
        },
        {
          q: "なぜ基礎段は常に 1.0× ですか?Quiver はどうやって基準金利を決めているのですか?",
          a: "基礎段は Bitfinex の「FRR マーケットオーダー」(rate=None)として送信されます — つまり「現在の FRR で自動約定」。FRR は Bitfinex がすべての funding 金利を動的に加重平均した値です。このタイプのオーダーは Bitfinex 撮合エンジンで優先順位を持つ(借り手はデフォルトで FRR プールを選ぶ)ため、市場の公正価格で素早く約定し、決して FRR より低く出されません。高い段(1.2× / 1.5× / 2× / 4×)は FRR の上に固定金利で出され、スパイクイベントを待ちます。",
        },
        {
          q: "高い急騰段(1.5× / 2× / 4×)が約定しない場合、機会損失になりますか?",
          a: "厳密にはそうです。しかし意図的なトレードオフです — それらの段は清算カスケードへの保険。普段は発火しませんが、1 回当たれば多数サイクル分の基礎段収益に相当します。急騰賭けを完全に避けたいなら保守(80% が基礎、5% が最上段)を選んでください。",
        },
        {
          q: "30 / 60 日ロックのオファー、途中で資金が必要になったらどうしますか?",
          a: "約定済み部分は満期まで待つ必要があります(Bitfinex のルールで、Quiver は変更できません)。アグレッシブを選ぶ前に流動性を要検討 — 1 ヶ月以内に資金を動かす可能性があれば、保守(最大 7 日)が安全です。",
        },
      ],
    },

    ctaPrimary: "ガイドトップに戻る →",
    ctaSecondary: "/earn で現在のプリセットを確認 →",
  },
};

function pickLocale(locale: string): Locale {
  if (locale === "en" || locale === "ja") return locale;
  return "zh-TW";
}

function PresetIcon({ kind }: { kind: PresetRow["icon"] }) {
  if (kind === "shield") return <Shield className="h-4 w-4 text-sky-600 dark:text-sky-400" />;
  if (kind === "zap") return <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  return <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
}

export default function StrategyPresetsGuidePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const s = STRINGS[pickLocale(locale)];

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href={`/${locale}/guide`}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-3 w-3" /> {s.back}
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{s.subtitle}</p>
      </div>

      {/* s1 — real-world question */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s1.h}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="whitespace-pre-line">{s.s1.body}</p>
          <ul className="ml-4 list-disc space-y-1.5">
            {s.s1.bullets.map((b, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            ))}
          </ul>
          <p className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Lightbulb className="mr-1 inline h-3.5 w-3.5" />
            {s.s1.insight}
          </p>
        </CardContent>
      </Card>

      {/* s2 — actual ladder breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s2.h}</CardTitle>
          <CardDescription className="whitespace-pre-line">{s.s2.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p className="whitespace-pre-line">{s.s2.body}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cream-edge text-left uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3">{s.s2.columns.pct}</th>
                  <th className="py-2 pr-3">{s.s2.columns.amount}</th>
                  <th className="py-2 pr-3">{s.s2.columns.multiplier}</th>
                  <th className="py-2 pr-3">{s.s2.columns.rate}</th>
                  <th className="py-2 pr-3">{s.s2.columns.period}</th>
                  <th className="py-2 pr-3">{s.s2.columns.note}</th>
                </tr>
              </thead>
              <tbody>
                {s.s2.rows.map((row, i) => (
                  <tr key={i} className="border-b border-cream-edge/60 dark:border-slate-800">
                    <td className="py-2 pr-3 font-mono">{row.pct}</td>
                    <td className="py-2 pr-3 font-mono">{row.amount}</td>
                    <td className="py-2 pr-3 font-mono">{row.multiplier}</td>
                    <td className="py-2 pr-3 font-mono text-emerald-700 dark:text-emerald-400">
                      {row.resultRate}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.period}</td>
                    <td className="py-2 pr-3 text-slate-500">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-md border border-emerald-300/60 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="font-medium text-emerald-900 dark:text-emerald-100">
              {s.s2.avgLine}: <span className="font-mono">{s.s2.avgValue}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-emerald-800 dark:text-emerald-200">{s.s2.avgNote}</p>
          </div>
        </CardContent>
      </Card>

      {/* s3 — preset comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s3.h}</CardTitle>
          <CardDescription className="whitespace-pre-line">{s.s3.lead}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cream-edge text-left uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <th className="py-2 pr-3">{s.s3.columns.name}</th>
                  <th className="py-2 pr-3">{s.s3.columns.ladderMin}</th>
                  <th className="py-2 pr-3">{s.s3.columns.baseFraction}</th>
                  <th className="py-2 pr-3">{s.s3.columns.topTranche}</th>
                  <th className="py-2 pr-3">{s.s3.columns.maxLockDays}</th>
                  <th className="py-2 pr-3">{s.s3.columns.bestFor}</th>
                </tr>
              </thead>
              <tbody>
                {s.s3.rows.map((row, i) => (
                  <tr key={i} className="border-b border-cream-edge/60 dark:border-slate-800">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <PresetIcon kind={row.icon} />
                        {row.name}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.ladderMin}</td>
                    <td className="py-2 pr-3 font-mono">{row.baseFraction}</td>
                    <td className="py-2 pr-3 font-mono">{row.topTranche}</td>
                    <td className="py-2 pr-3 font-mono">{row.maxLockDays}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{row.bestFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* s4 — practical advice by balance tier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s4.h}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {s.s4.items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-cream-edge p-3 dark:border-slate-700"
            >
              <div className="font-medium">{item.title}</div>
              <p
                className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300"
                dangerouslySetInnerHTML={{
                  __html: item.body.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* s5 — FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s5.h}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {s.s5.items.map((item, i) => (
            <div key={i}>
              <div className="font-medium text-slate-900 dark:text-slate-100">Q. {item.q}</div>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">A. {item.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/${locale}/guide`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-cream-edge bg-paper px-4 py-2.5 text-sm font-medium text-slate-ink hover:bg-cream/60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        >
          {s.ctaPrimary}
        </Link>
        <Link
          href={`/${locale}/earn`}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          {s.ctaSecondary} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
