/* ============================================================================
   finhub-etf-basics.js — FinHub content module (self-registering)
   ----------------------------------------------------------------------------
   Adds the "ETF Basics" tab to FinHub. Edit text/numbers only.
   Conventions:
     • German numeric notation: thousands "." and decimals "," (e.g. 1.000, 26,375).
     • A space before % and units (e.g. 25 %).
     • Headings and sub-headings in Title Case.
     • *bold* and _italic_ inline emphasis.
   ========================================================================== */
(window.FINHUB = window.FINHUB || { tabs: [] }).tabs.push({
  id: "etf-basics",
  label: "ETF Basics",
  eyebrow: "Reference Guide \u00b7 Germany",
  title: "ETF Investing Basics",
  subtitle: "What an ETF is, how to choose one, replication, dividends, and key rules",

  sections: [

    /* ---- WHAT IS AN INDEX / ETF --------------------------------------- */
    {
      label: "Start Here",
      title: "What Is An Index, And What Is An ETF?",
      rules: [
        {
          icon: "activity",
          text: "*An Index Is A Scoreboard.* An _index_ is a defined list of companies plus " +
                "a rule for how much weight each one gets. The MSCI World lists ~1.500 large " +
                "companies across developed countries; the MSCI ACWI (All Country World Index) " +
                "adds emerging markets for ~2.500\u20133.000 companies. An index is only a number " +
                "\u2014 it cannot be bought. It simply measures how a slice of the market performed."
        },
        {
          icon: "merge",
          text: "*An ETF Is The Buyable Basket.* An _ETF_ (Exchange-Traded Fund) is a real fund " +
                "that holds actual shares and tracks that scoreboard. One share of a World ETF " +
                "makes the holder a part-owner of all the underlying companies at once. " +
                "Exchange-Traded means it trades on a stock exchange like a normal share, " +
                "buyable any time the market is open."
        },
        {
          icon: "coin",
          text: "*Why It Matters.* Instead of researching and buying hundreds of companies " +
                "individually \u2014 expensive, slow, and risky \u2014 a single basket buys the " +
                "whole market in one step."
        }
      ]
    },

    /* ---- THE BASICS AT A GLANCE --------------------------------------- */
    {
      label: "ETF Investing",
      title: "The Basics At A Glance",
      metrics: [
        { label: "Diversification",   value: "1.000s",      sub: "of stocks in one purchase" },
        { label: "Typical Cost (TER)", value: "0,05\u20130,25 %", sub: "per year, broad equity ETFs" },
        { label: "Min. Investment",    value: "~\u20ac1",    sub: "via a monthly savings plan" },
        { label: "Teilfreistellung",   value: "30 %",        sub: "of gains tax-free (equity ETFs)" }
      ],
      note: "*Diversification* means not concentrating wealth in one place. If a single company " +
            "collapses, it is one tiny slice of thousands \u2014 so the overall portfolio barely " +
            "notices. This is the main reason ETFs are considered lower-risk than picking " +
            "individual stocks."
    },

    /* ---- HOW AN ETF WORKS --------------------------------------------- */
    {
      label: "Mechanics",
      title: "How An ETF Actually Works",
      rules: [
        {
          icon: "activity",
          text: "*It Tracks, It Doesn't Try To Win.* The fund's goal is to _mirror_ its index, " +
                "not beat it. Its return roughly equals the index return minus a small yearly " +
                "cost. It will never spectacularly outperform \u2014 and that is the point: it " +
                "reliably matches the market, which over decades beats most professional " +
                "stock-pickers."
        },
        {
          icon: "coin",
          text: "*NAV \u2014 The True Value.* The _NAV_ (Net Asset Value) is the worth of " +
                "everything the fund holds, divided by the number of shares. It is the fund's " +
                "honest price tag at any moment."
        },
        {
          icon: "merge",
          text: "*Market Makers Keep The Price Honest.* A _market maker_ is a firm that " +
                "continuously offers to buy and sell the ETF. If the trading price drifts from " +
                "the NAV, market makers arbitrage the gap away. The result: the price paid " +
                "almost exactly matches the value of the underlying stocks."
        },
        {
          icon: "receipt",
          text: "*Dividends Don't Disappear.* Companies pay out part of their profit as " +
                "_dividends_. The ETF collects them and either reinvests them or pays them out " +
                "\u2014 either way, the investor receives them."
        }
      ]
    },

    /* ---- COST: TER VS TD ---------------------------------------------- */
    {
      label: "Costs",
      title: "TER vs. Tracking Difference",
      compare: [
        {
          badge: "Headline Figure", tone: "sub",
          title: "TER (Total Expense Ratio)",
          rows: [
            { key: "What It Is",            val: "Advertised annual fee" },
            { key: "How It's Paid",         val: "Skimmed daily, baked into price" },
            { key: "On \u20ac1.000 At 0,20 %", val: "~\u20ac2 per year" },
            { key: "Tells The Full Story?", val: "No \u2014 only part of it" }
          ]
        },
        {
          badge: "What Matters", tone: "best",
          title: "Tracking Difference (TD)",
          rows: [
            { key: "What It Is",      val: "Real gap: index vs. fund" },
            { key: "vs. The TER",     val: "Often smaller" },
            { key: "Why Smaller",     val: "Side income (e.g. lending)" },
            { key: "Can Go Negative?", val: "Yes \u2014 fund beats index" }
          ]
        }
      ],
      tip: "*Key Takeaway:* Two funds tracking the same index can show different TERs yet deliver " +
           "near-identical real-world results. The tracking difference (available free at " +
           "trackingdifferences.com) is a better basis for a decision than the headline fee alone."
    },

    /* ---- REPLICATION METHOD ------------------------------------------- */
    {
      label: "Under The Hood",
      title: "Replication \u2014 How The Fund Copies The Index",
      compare: [
        {
          badge: "Most Transparent", tone: "best",
          title: "Physical \u2014 Full",
          rows: [
            { key: "What It Does", val: "Buys every index stock, exact weights" },
            { key: "Trade-off",    val: "Impractical for huge indices" }
          ]
        },
        {
          badge: "Common Default", tone: "best",
          title: "Physical \u2014 Sampling",
          rows: [
            { key: "What It Does", val: "Buys a representative subset" },
            { key: "Trade-off",    val: "Tiny imperfection; owns real shares" }
          ]
        },
        {
          badge: "Adds A Risk", tone: "sub",
          title: "Synthetic (Swap-Based)",
          rows: [
            { key: "What It Does", val: "Contract pays the index return" },
            { key: "Trade-off",    val: "Counterparty risk" }
          ]
        },
        {
          badge: "Unproven", tone: "sub",
          title: "Hybrid",
          rows: [
            { key: "What It Does", val: "Mix of physical and synthetic" },
            { key: "Trade-off",    val: "Often lacks a long track record" }
          ]
        }
      ],
      tip: "*Why It Matters:* _Counterparty risk_ is the risk that the other party in a contract " +
           "fails to pay. Physical ETFs avoid it because they hold the actual shares. For a first " +
           "ETF, physical (sampling) is the low-worry default. Synthetic is not inherently bad, " +
           "but it requires trusting a contract as well as the market."
    },

    /* ---- ACCUMULATING VS DISTRIBUTING --------------------------------- */
    {
      label: "Dividends",
      title: "Accumulating vs. Distributing",
      compare: [
        {
          badge: "Default For Growth", tone: "best",
          title: "Accumulating (Acc / Thesaurierend)",
          rows: [
            { key: "Dividends", val: "Reinvested automatically" },
            { key: "Effort",    val: "Zero \u2014 compounding is hands-off" },
            { key: "Best For",  val: "Building wealth over years" }
          ]
        },
        {
          badge: "Useful For Income", tone: "sub",
          title: "Distributing (Dist / Aussch\u00fcttend)",
          rows: [
            { key: "Dividends", val: "Paid into the cash account" },
            { key: "Effort",    val: "Manual reinvesting to compound" },
            { key: "Best For",  val: "Drawing an income to live on" }
          ]
        }
      ],
      tip: "*Compounding* \u2014 earning returns on past returns \u2014 is what makes long-term " +
           "investing work, and accumulating funds do it automatically. During the saving-up " +
           "phase, before living off the portfolio, accumulating is the common choice."
    },

    /* ---- GERMAN TAX TERMS --------------------------------------------- */
    {
      label: "German Tax",
      title: "Two Terms You'll Meet",
      rules: [
        {
          icon: "receipt",
          text: "*Teilfreistellung (Partial Exemption).* For equity ETFs (those holding at least " +
                "51 % stocks), Germany makes 30 % of gains completely tax-free, so only 70 % of " +
                "profit is taxed. Individual stocks do not get this \u2014 a real reason ETFs are " +
                "tax-efficient in Germany."
        },
        {
          icon: "coin",
          text: "*Vorabpauschale (Advance Lump Sum).* Because accumulating funds pay out no cash " +
                "to tax, Germany pre-charges a small estimated yearly tax rather than waiting " +
                "decades. It is typically modest, the broker calculates and withholds it " +
                "automatically, and it counts toward the annual tax-free allowance " +
                "(Sparerpauschbetrag)."
        }
      ]
    },

    /* ---- STRATEGY: TIME IN THE MARKET --------------------------------- */
    {
      label: "Strategy",
      title: "Three Approaches \u2014 One Winner",
      strategies: [
        {
          verdict: "Avoid", tone: "avoid",
          name: "Timing The Market",
          desc: "Trying to buy the bottom and sell the top. Missing just the ~10 best days in a " +
                "decade erases most of the return \u2014 and those best days often follow the " +
                "worst drops, exactly when a market-timer has already sold."
        },
        {
          verdict: "Suboptimal", tone: "sub",
          name: "Sitting In Cash",
          desc: "Staying out until things calm down. It feels safe, but inflation shrinks idle " +
                "cash's buying power every year, while markets trend upward over the long run."
        },
        {
          verdict: "Best", tone: "best", winner: true,
          name: "Time In The Market",
          desc: "Set up a monthly savings plan (Sparplan), invest the same amount automatically, " +
                "and stay invested through ups and downs."
        }
      ],
      tip:  "*Why Time Beats Timing:* Over 10\u201330 year horizons, how long one stays invested " +
            "matters far more than when one starts. A regular savings plan also provides _cost " +
            "averaging_ \u2014 buying every month automatically picks up more shares when prices " +
            "are low and fewer when high, smoothing the average entry price.",
      warn: "*The Real Risk Is Behavioural:* At some point a portfolio will drop 30\u201340 % " +
            "(a _drawdown_ \u2014 the fall from a peak to a low). Markets have historically " +
            "recovered, but only investors who do not sell at the bottom capture that recovery."
    },

    /* ---- RULES OF THUMB ----------------------------------------------- */
    {
      label: "Before You Start",
      title: "Rules Of Thumb",
      rules: [
        {
          icon: "merge",
          text: "*One Broad Fund Is Often Enough.* A single global ETF (MSCI ACWI or FTSE " +
                "All-World) already holds thousands of companies worldwide. For most people, " +
                "that one fund is the portfolio."
        },
        {
          icon: "ban",
          text: "*Beware Hidden Overlap.* A World ETF plus an S&P 500 plus a tech ETF is not " +
                "extra diversification \u2014 it is owning the same handful of large US companies " +
                "several times over."
        },
        {
          icon: "calendar",
          text: "*Match The Horizon To The Risk.* Equity ETFs suit money not needed for 10+ " +
                "years. For money needed soon, a badly-timed drawdown could force a sale at a loss."
        },
        {
          icon: "activity",
          text: "*Past Performance Is Not A Promise.* A strong recent chart says little about the " +
                "future. Cost, diversification, and discipline matter more than chasing last " +
                "year's winner."
        }
      ]
    }
  ],

  footer: "This summary reflects German tax law as of June 2026. Tax rules can change \u2014 verify " +
          "with a Steuerberater for personal advice."
});
