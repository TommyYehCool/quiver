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
    title: "④ 策略偏好 + Ladder 完整說明",
    subtitle:
      "保守/平衡/進取 到底差在哪?ladder 怎麼切?為什麼有時候你的策略「沒生效」?用一個實際例子拆給你看。",

    s1: {
      h: "先講一個常見問題",
      body: '用戶 A 存了 $200 USDT、選平衡策略,結果 Bitfinex 上看到一筆「$200 全押、2 天、APR 2.92%」的 offer。他問:「我選了平衡的 5 階 ladder,怎麼只看到 1 筆?」',
      bullets: [
        "答案是:他的 ladder **根本沒啟動**",
        "平衡策略最後一階(極端 spike)只佔 3%,Bitfinex 規定每筆 offer 最少 $150",
        "→ Ladder 啟動門檻 = 150 ÷ 0.03 = **$5,000**",
        "$200 < $5,000 → 系統 silently fallback 到「單一 offer」模式",
      ],
      insight:
        "這不是 bug,是設計上的權衡。Bitfinex 平台規定每筆 offer 最少 $150,如果硬切 5 階,小資金每階只有幾十塊,Bitfinex 會直接拒收。所以 Quiver 在資金不夠時會自動退回單一 offer。但 UI 沒告訴你這件事(這是個待修的 UX bug)。",
    },

    s2: {
      h: "Ladder 真的啟動時長什麼樣子?",
      lead: "假設你是平衡策略 + 有 $5,000、目前市場 base APR 2.92%,Quiver 會把你的 $5,000 切成 5 階:",
      body: "每階用不同利率掛 offer。基礎那檔 1.0×(就是 base rate)會最快被借走;後面幾階加價等「spike 事件」(BTC 突然大漲大跌、有人爆倉急著借錢)。沒 spike 就掛在那邊不成交,等就是了。",
      columns: {
        pct: "佔比",
        amount: "金額",
        multiplier: "倍率",
        rate: "結果 APR",
        period: "鎖定天數",
        note: "用途",
      },
      rows: [
        { pct: "60%", amount: "$3,000", multiplier: "1.0×", resultRate: "2.92%", period: "2 天", note: "基礎(快速成交)" },
        { pct: "20%", amount: "$1,000", multiplier: "1.2×", resultRate: "3.50%", period: "2 天", note: "輕度 spike" },
        { pct: "10%", amount: "$500", multiplier: "1.5×", resultRate: "4.38%", period: "2 天", note: "中度 spike" },
        { pct: "7%", amount: "$350", multiplier: "2.0×", resultRate: "5.84%", period: "7 天 ★", note: "重度 spike(過 5% 鎖長)" },
        { pct: "3%", amount: "$150", multiplier: "4.0×", resultRate: "11.68%", period: "14 天 ★★", note: "極端事件(爆倉潮)" },
      ],
      avgLine: "整體加權平均",
      avgValue: "≈ 3.41% APR",
      avgNote:
        "比單一 offer 的 2.92% 多 0.49% — 而且這還沒算「spike 真的發生時」後面幾階吃到 5-12% 的 bonus。Ladder 的真正價值在最後那兩階:平常掛在那邊不動,等到一個爆倉潮就直接吃到飆漲價、而且鎖長 7-14 天,等市場冷靜後你還在賺高利。",
    },

    s3: {
      h: "三個 preset 真正的差別",
      lead: "Ladder 啟動門檻不一樣 + 資金分配不一樣 + 鎖定上限不一樣。三個維度同時在動。",
      columns: {
        name: "策略",
        ladderMin: "Ladder 啟動門檻",
        baseFraction: "基礎那檔比例",
        topTranche: "最高 spike 檔",
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
          bestFor: "兼顧成交速度與 spike 收益",
        },
        {
          name: "進取",
          icon: "zap",
          ladderMin: "$1,875",
          baseFraction: "40%",
          topTranche: "4.0× × 8%",
          maxLockDays: "60 天",
          bestFor: "願意鎖長換大 spike 收益",
        },
      ],
    },

    s4: {
      h: "對你的具體建議",
      items: [
        {
          title: "餘額 < $1,875",
          body: "選哪個 preset 結果都一樣 — 都走單一 offer。在冷市場(< 5% APR)會掛 2 天、熱市場才會自動鎖長。要看到策略真正的差異,先想辦法讓餘額過門檻。",
        },
        {
          title: "餘額 $1,875 ~ $3,000",
          body: "**只有進取會啟動 ladder**(因為門檻最低)。如果你想體驗 5 階 ladder,選進取。但要知道:進取會把 35% 資金壓在 ≥1.5× 的 spike 檔,平常時段成交比較慢。",
        },
        {
          title: "餘額 $3,000 ~ $5,000",
          body: "保守和進取都能 ladder,平衡還不行。如果想要平衡的「6/2/1/0.7/0.3 五階」,需要再加碼到 $5K。",
        },
        {
          title: "餘額 ≥ $5,000",
          body: "三個 preset 都能完整啟動 ladder,可以照風險偏好挑。預設平衡就是最 vanilla 的選擇 — 6 成快進場、3.4 成等 spike,30 天最大鎖定。",
        },
        {
          title: "市場很冷時(像現在 ~3% APR)",
          body: "**不要為了「看起來在做事」而切到進取或鎖長**。冷市場切長期 = 把當下的爛價鎖住,等明天市場熱了你還是賺 2.92%。Quiver 預設 2 天期就是要在冷市場保留快速 reprice 的彈性。",
        },
      ],
    },

    s5: {
      h: "常見問答",
      items: [
        {
          q: "我換 preset,目前在借的 offer 會立刻改嗎?",
          a: "不會。已成交的 offer 會跑完當前期(2-30 天不等),到期回到 funding wallet 後,下一輪 auto_lend 才會用新 preset 計算。",
        },
        {
          q: "為什麼基礎那檔都 1.0×?Quiver 怎麼決定 base rate?",
          a: "Quiver 抓 Bitfinex order book,往下走深度 = 2 × 你的金額,找到「累積比我便宜的供給達到 2 倍」那一格的利率,當作 base。這個邏輯確保你掛的 offer 會排在前面、優先被借走,不會卡在隊伍尾巴。",
        },
        {
          q: "高 spike 檔(1.5× / 2× / 4×)如果一直沒成交,我是不是少賺了?",
          a: "嚴格說是。但這是有意識的取捨 — 那幾檔是「等爆倉潮」用的保險。冷市場大部分時候不會中,但中一次抵很多次 base 的收益。如果你完全不想賭 spike、想要每筆都成交,選保守(80% 在基礎,5% 在最高)。",
        },
        {
          q: "鎖定 30 / 60 天的單,我中途想用錢怎麼辦?",
          a: "已經被借走的部分必須等到期(這是 Bitfinex 規則,Quiver 動不了)。所以選進取前要想清楚 — 如果你 1 個月內可能要動到錢,選保守(最大 7 天)比較合適。",
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
          a: "Quiver walks the Bitfinex order book to depth = 2× your amount, finds the rate where cumulative cheaper supply equals that depth, and uses it as base. This ensures your offer ranks well in the queue and gets filled fast.",
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
    title: "④ 戦略プリセット + Ladder 完全解説",
    subtitle:
      "保守 / 平衡 / 進取 の本当の違いは?Ladder はどう機能するのか?なぜ時々戦略が「効いていない」ように見えるのか?実例で解説します。",

    s1: {
      h: "よくある質問から",
      body: 'あるユーザーが $200 USDT を入金、平衡を選択。Bitfinex 上には「$200 全額・2 日・APR 2.92%」のオファーが 1 件のみ表示。彼は尋ねました:「平衡の 5 階 ladder を選んだのに、なぜ 1 件しか見えないの?」',
      bullets: [
        "答え:彼の ladder は **そもそも起動していない**",
        "平衡の最後の階(極端 spike)は全体の 3%、Bitfinex は 1 オファー最低 $150 を要求",
        "→ Ladder 起動閾値 = 150 ÷ 0.03 = **$5,000**",
        "$200 < $5,000 → システムは「単一オファー」モードに自動フォールバック",
      ],
      insight:
        "これはバグではなく、設計上のトレードオフです。Bitfinex の最低 $150 / オファーというルール下で、$200 を 5 階に切ると各階 ~$40 となり拒否されます。よって Quiver は資金不足時に単一オファーへ自動フォールバック。ただし UI はそれを伝えていません(既知の UX 改善項目)。",
    },

    s2: {
      h: "実際に Ladder が起動するとどう見える?",
      lead: "平衡 + $5,000、現在の市場ベース APR が 2.92% の場合、Quiver は $5,000 を 5 階に分割:",
      body: "各階は異なる利率でオファー掲示。基礎 1.0× が最速で約定。上の階は「spike イベント」(BTC の急変動、清算カスケードなど)を待ちます。spike が来なければ約定しないだけで、それでも問題ありません。",
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
        { pct: "20%", amount: "$1,000", multiplier: "1.2×", resultRate: "3.50%", period: "2 日", note: "軽度 spike 捕捉" },
        { pct: "10%", amount: "$500", multiplier: "1.5×", resultRate: "4.38%", period: "2 日", note: "中度 spike" },
        { pct: "7%", amount: "$350", multiplier: "2.0×", resultRate: "5.84%", period: "7 日 ★", note: "重度 spike(>5% でロック長く)" },
        { pct: "3%", amount: "$150", multiplier: "4.0×", resultRate: "11.68%", period: "14 日 ★★", note: "極端事件(清算カスケード)" },
      ],
      avgLine: "加重平均",
      avgValue: "≈ 3.41% APR",
      avgNote:
        "単一オファー 2.92% より +0.49%。spike が実際に発生した際に上位階が 5-12% を取る bonus は別途加算されます。Ladder の真価は最後の 2 階 — 普段は静かに待機し、爆倉潮が来た瞬間に高利率を捕捉して 7-14 日ロック。市場が落ち着いた後も高利を稼ぎ続けます。",
    },

    s3: {
      h: "プリセット間の本当の違い",
      lead: "3 つの軸が同時に変わります:Ladder 起動閾値、各階の配分、最大ロック日数。",
      columns: {
        name: "プリセット",
        ladderMin: "Ladder 閾値",
        baseFraction: "基礎階比率",
        topTranche: "最高 spike 階",
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
          bestFor: "流動性重視、長期ロック避けたい",
        },
        {
          name: "平衡(デフォルト)",
          icon: "scales",
          ladderMin: "$5,000",
          baseFraction: "60%",
          topTranche: "4.0× × 3%",
          maxLockDays: "30 日",
          bestFor: "約定速度と spike 収益の両立",
        },
        {
          name: "進取",
          icon: "zap",
          ladderMin: "$1,875",
          baseFraction: "40%",
          topTranche: "4.0× × 8%",
          maxLockDays: "60 日",
          bestFor: "長期ロック許容で大 spike 狙い",
        },
      ],
    },

    s4: {
      h: "あなたへの具体的アドバイス",
      items: [
        {
          title: "残高 < $1,875",
          body: "プリセットを変えても結果は同じ — 全て単一オファーになります。冷市場(<5% APR)では 2 日、熱市場では自動的に長期ロックされます。プリセットの違いを体感するには、まず閾値を超えてください。",
        },
        {
          title: "$1,875 ~ $3,000",
          body: "**進取のみ ladder 起動可能**(閾値最低)。5 階 ladder を体感したいなら進取。ただし 35% を ≥1.5× の spike 階に置くため、平常時の約定は遅め。",
        },
        {
          title: "$3,000 ~ $5,000",
          body: "保守と進取は ladder 可能、平衡はまだ不可。平衡の「60/20/10/7/3 五階」が欲しければ $5K まで増やしてください。",
        },
        {
          title: "残高 ≥ $5,000",
          body: "3 プリセットすべて ladder 完全起動可能 — リスク選好で選んでください。デフォルトの平衡は最も標準的:60% 高速約定、40% spike 待機、最大 30 日ロック。",
        },
        {
          title: "冷市場時(現在 ~3% APR)",
          body: "**「何かしている感」のために進取や長期ロックに切り替えてはいけません**。冷市場で長期ロック = 悪い利率を固定。明日市場が熱しても 2.92% のまま。デフォルト 2 日期間は冷市場での reprice 柔軟性を保つためです。",
        },
      ],
    },

    s5: {
      h: "FAQ",
      items: [
        {
          q: "プリセットを変えると、現在借出中のオファーはすぐ変わる?",
          a: "いいえ。約定済オファーは満期まで(2-30 日)継続。満期後 funding wallet に戻った時、次回 auto_lend サイクルで新プリセットが適用されます。",
        },
        {
          q: "なぜ基礎階は常に 1.0×?Quiver はどう base rate を決めている?",
          a: "Quiver は Bitfinex order book を深度 = 2 × 自身の金額まで歩き、累積供給がその深度に達する利率を base として採用。これによりキューで前列に並び、高速約定されます。",
        },
        {
          q: "高 spike 階(1.5× / 2× / 4×)が約定しない場合、機会損失?",
          a: "厳密には Yes。ただし意図的なトレードオフです — それらの階は清算カスケードへの保険。普段は発火しないが、1 回当たれば多数サイクルの base 収益分に相当。spike 賭けを完全に避けたいなら保守(80% 基礎、5% 最上階)を選択。",
        },
        {
          q: "30 / 60 日ロックのオファー、途中で資金が必要になったら?",
          a: "約定済部分は満期まで待つ必要あり(Bitfinex のルール、Quiver は変更不可)。よって進取選択前に流動性を要検討 — 1 ヶ月以内に資金を動かす可能性があれば保守(最大 7 日)が安全。",
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
          <p>{s.s1.body}</p>
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
          <CardDescription>{s.s2.lead}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <p>{s.s2.body}</p>
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
            <p className="mt-1 text-emerald-800 dark:text-emerald-200">{s.s2.avgNote}</p>
          </div>
        </CardContent>
      </Card>

      {/* s3 — preset comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{s.s3.h}</CardTitle>
          <CardDescription>{s.s3.lead}</CardDescription>
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
                className="mt-1 text-xs text-slate-600 dark:text-slate-300"
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
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">A. {item.a}</p>
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
