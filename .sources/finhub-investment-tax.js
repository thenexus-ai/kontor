/* ============================================================================
   finhub-investment-tax.js — FinHub content module (self-registering)
   ----------------------------------------------------------------------------
   Adds the "Investment Tax" tab to FinHub. Edit text/numbers only.
   Conventions:
     • German numeric notation: thousands "." and decimals "," (e.g. 1.000, 26,375).
     • A space before % and units (e.g. 25 %).
     • Headings and sub-headings in Title Case.
     • *bold* and _italic_ inline emphasis.
   ========================================================================== */
(window.FINHUB = window.FINHUB || { tabs: [] }).tabs.push({
  id: "investment-tax",
  label: "Investment Tax",
  eyebrow: "Reference Guide \u00b7 Germany",
  title: "Investment Tax Strategy",
  subtitle: "Sparerpauschbetrag, harvest & reinvest, ETFs vs. stocks, and key rules",

  sections: [

    /* ---- THE BASICS ---------------------------------------------------- */
    {
      label: "German Investment Tax",
      title: "The Basics",
      metrics: [
        { label: "Sparerpauschbetrag", value: "\u20ac1.000", sub: "per person, per year" },
        { label: "Abgeltungsteuer",    value: "25 %",        sub: "+ 5,5 % Soli = 26,375 %" },
        { label: "Couples Allowance",  value: "\u20ac2.000", sub: "jointly assessed" },
        { label: "Tax Saved At Max",   value: "~\u20ac264",  sub: "per year if fully used" }
      ],
      note: "The allowance covers all capital income combined: *interest, dividends, " +
            "the Vorabpauschale on accumulating ETFs, and any realized gains.* It is " +
            "use-it-or-lose-it \u2014 unused amounts do not roll over to the next year. " +
            "You must file a *Freistellungsauftrag* with your broker for it to be applied " +
            "automatically."
    },

    /* ---- STRATEGY COMPARISON ------------------------------------------- */
    {
      label: "Strategy Comparison",
      title: "Three Approaches \u2014 One Winner",
      strategies: [
        {
          verdict: "Avoid", tone: "avoid",
          name: "Realize And Keep Cash",
          desc: "Sell gains within the allowance but don't reinvest. Uses the allowance " +
                "but loses market exposure and future compounding on that amount."
        },
        {
          verdict: "Suboptimal", tone: "sub",
          name: "Leave Fully Invested",
          desc: "Stay in the market, defer taxes. Good \u2014 deferred tax keeps compounding. " +
                "But you waste the annual allowance, permanently leaving ~\u20ac264/year of tax " +
                "savings on the table."
        },
        {
          verdict: "Best", tone: "best", winner: true,
          name: "Harvest & Reinvest",
          desc: "Sell up to the allowance, then immediately rebuy the same position. Locks in " +
                "tax-free gains, steps up your cost basis, and keeps you fully invested."
        }
      ],
      tip:  "*Why Harvest Beats Deferral:* Deferral delays tax but you still pay it eventually. " +
            "Harvesting within the allowance eliminates that tax permanently \u2014 and since you " +
            "rebuy immediately, you give up no compounding. Tax-free always beats tax-deferred-then-taxed.",
      warn: "*In Early Years:* You don't need \u20ac1.000 of gains to benefit. Harvesting any " +
            "amount of unrealized gains is still worthwhile \u2014 just make sure transaction " +
            "costs don't eat the saving. At \u20ac0\u20131 per trade, even small harvests are worthwhile."
    },

    /* ---- TIMING -------------------------------------------------------- */
    {
      label: "Execution",
      title: "Timing & The Price Gap Risk",
      rules: [
        {
          icon: "calendar",
          text: "*Calendar Year, Not Purchase Anniversary.* Germany has no short-term vs. " +
                "long-term distinction \u2014 the same 26,375 % applies whether you held for one " +
                "day or twenty years. The only deadline is December 31."
        },
        {
          icon: "clock",
          text: "*Execute By ~December 27\u201328.* Trades settle T+2, so leave two business " +
                "days before year-end for the sale to officially settle in the current tax year. " +
                "Anytime earlier in the year is fine too."
        },
        {
          icon: "activity",
          text: "*The Price Gap Risk Is Real But Tiny In Execution.* In the seconds between " +
                "selling and rebuying, meaningful price moves are statistically negligible. " +
                "However, for volatile individual stocks the bigger practical risk is _when_ you " +
                "choose to harvest, not the execution gap itself. Broad ETFs are far less exposed " +
                "to sudden event-driven moves."
        }
      ]
    },

    /* ---- ETF VS STOCKS ------------------------------------------------- */
    {
      label: "Asset Type Matters",
      title: "ETFs vs. Individual Stocks",
      compare: [
        {
          badge: "Recommended", tone: "best",
          title: "Equity ETFs",
          rows: [
            { key: "Teilfreistellung",                 val: "30 % of gains exempt" },
            { key: "To Use Full \u20ac1.000 Allowance", val: "Realize ~\u20ac1.428 gross" },
            { key: "Gains Above Allowance",             val: "Only 70 % taxed" },
            { key: "Volatility Risk On Harvest",        val: "Lower (diversified)" }
          ]
        },
        {
          badge: "More Complex", tone: "sub",
          title: "Individual Stocks",
          rows: [
            { key: "Teilfreistellung",                 val: "None" },
            { key: "To Use Full \u20ac1.000 Allowance", val: "Realize \u20ac1.000 exactly" },
            { key: "Gains Above Allowance",             val: "100 % taxed" },
            { key: "Volatility Risk On Harvest",        val: "Higher (event risk)" }
          ]
        }
      ],
      tip: "*Key Takeaway:* Individual stocks are simpler to calculate within the allowance, " +
           "but ETFs are more tax-efficient for the larger portfolio because of the 30 % partial " +
           "exemption on everything above the allowance. Both dividends and gains from individual " +
           "stocks are fully taxable with no exemption."
    },

    /* ---- KEY RULES ----------------------------------------------------- */
    {
      label: "Important Rules",
      title: "Things Germany Does (And Doesn't) Have",
      rules: [
        {
          icon: "ban",
          text: "*No Wash-Sale Rule.* You can sell an ETF and immediately rebuy the exact same " +
                "one. The gain is fully and validly realized. No waiting period required \u2014 unlike in the US."
        },
        {
          icon: "sort",
          text: "*FIFO Applies.* When selling a position you've been adding to over time, " +
                "Germany always deems your oldest shares sold first. This is usually helpful \u2014 " +
                "older shares have the largest gains to step up."
        },
        {
          icon: "merge",
          text: "*Losses Offset Gains.* If you sell a losing position in the same year, those " +
                "losses net against your realized gains. This means you could harvest more than " +
                "\u20ac1.000 gross from winners and still land at \u20ac1.000 net \u2014 fully covered by the allowance."
        },
        {
          icon: "coin",
          text: "*Vorabpauschale Eats Into The Allowance.* Accumulating ETFs have an annual " +
                "advance lump-sum tax even without distributions. This counts against your " +
                "\u20ac1.000, so check how much remains before deciding how much to harvest."
        },
        {
          icon: "receipt",
          text: "*No Holding-Period Distinction.* Germany has no equivalent of the US short-term " +
                "/ long-term capital gains split. The flat 26,375 % applies to all gains regardless " +
                "of how long you've held the asset."
        }
      ]
    }
  ]
});
