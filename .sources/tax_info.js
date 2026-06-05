/* ============================================================================
   tax_info.js  —  content for the "Investment tax strategy" info popup
   ----------------------------------------------------------------------------
   This file holds ONLY the text and numbers shown in the info modal.
   To update it (e.g. when tax law changes), edit the strings/numbers below.
   You never need to touch markup or styling — finance_dashboard.js renders
   this data using the dashboard's own classes, so it always matches the theme.

   Notes on structure:
     • Use \u2014 for an em dash, \u2192 for an arrow, \u20ac for euro, etc.,
       OR just type the characters directly — both work.
     • Inline emphasis is supported in note / desc / text fields using simple
       *asterisks*  -> rendered bold.  e.g. "the *Freistellungsauftrag* form".
       (Nothing else is interpreted, so plain text is always safe.)
     • Reflects German tax law as of 2026 — see `footer` below.
   ========================================================================== */

window.TAX_INFO = {
  eyebrow: "Reference guide \u00b7 Germany",
  title: "Tax Infos",
  subtitle: "Sparerpauschbetrag, harvest & reinvest, ETFs vs. stocks, and key rules",

  sections: [

    /* ---- THE BASICS ---------------------------------------------------- */
    {
      label: "German investment tax",
      title: "The basics",
      metrics: [
        { label: "Sparerpauschbetrag", value: "\u20ac1.000", sub: "per person, per year" },
        { label: "Abgeltungsteuer",    value: "25%",        sub: "+ 5.5% Soli = 26.375%" },
        { label: "Couples allowance",  value: "\u20ac2.000", sub: "jointly assessed" },
        { label: "Tax saved at max",   value: "~\u20ac264",  sub: "per year if fully used" }
      ],
      note: "The allowance covers all capital income combined: *interest, dividends, " +
            "the Vorabpauschale on accumulating ETFs, and any realized gains.* It is " +
            "use-it-or-lose-it \u2014 unused amounts do not roll over to the next year. " +
            "You must file a *Freistellungsauftrag* with your broker for it to be applied " +
            "automatically."
    },

    /* ---- STRATEGY COMPARISON ------------------------------------------- */
    {
      label: "Strategy comparison",
      title: "Three approaches \u2014 one winner",
      strategies: [
        {
          verdict: "Avoid", tone: "avoid",
          name: "Realize and keep cash",
          desc: "Sell gains within the allowance but don't reinvest. Uses the allowance " +
                "but loses market exposure and future compounding on that amount."
        },
        {
          verdict: "Suboptimal", tone: "sub",
          name: "Leave fully invested",
          desc: "Stay in the market, defer taxes. Good \u2014 deferred tax keeps compounding. " +
                "But you waste the annual allowance, permanently leaving ~\u20ac264/year of tax " +
                "savings on the table."
        },
        {
          verdict: "Best", tone: "best", winner: true,
          name: "Harvest & reinvest",
          desc: "Sell up to the allowance, then immediately rebuy the same position. Locks in " +
                "tax-free gains, steps up your cost basis, and keeps you fully invested."
        }
      ],
      tip:  "*Why harvest beats deferral:* Deferral delays tax but you still pay it eventually. " +
            "Harvesting within the allowance eliminates that tax permanently \u2014 and since you " +
            "rebuy immediately, you give up no compounding. Tax-free always beats " +
            "tax-deferred-then-taxed.",
      warn: "*In early years:* You don't need \u20ac1.000 of gains to benefit. Harvesting any " +
            "amount of unrealized gains is still worthwhile \u2014 just make sure transaction " +
            "costs don't eat the saving. At \u20ac0\u20131 per trade, even small harvests are worthwhile."
    },

    /* ---- TIMING -------------------------------------------------------- */
    {
      label: "Execution",
      title: "Timing & the price gap risk",
      rules: [
        {
          icon: "calendar",
          text: "*Calendar year, not purchase anniversary.* Germany has no short-term vs. " +
                "long-term distinction \u2014 the same 26.375% applies whether you held for one " +
                "day or twenty years. The only deadline is December 31."
        },
        {
          icon: "clock",
          text: "*Execute by ~December 27\u201328.* Trades settle T+2, so leave two business " +
                "days before year-end for the sale to officially settle in the current tax year. " +
                "Anytime earlier in the year is fine too."
        },
        {
          icon: "activity",
          text: "*The price gap risk is real but tiny in execution.* In the seconds between " +
                "selling and rebuying, meaningful price moves are statistically negligible. " +
                "However, for volatile individual stocks the bigger practical risk is _when_ you " +
                "choose to harvest, not the execution gap itself. Broad ETFs are far less exposed " +
                "to sudden event-driven moves."
        }
      ]
    },

    /* ---- ETF VS STOCKS ------------------------------------------------- */
    {
      label: "Asset type matters",
      title: "ETFs vs. individual stocks",
      compare: [
        {
          badge: "Recommended", tone: "best",
          title: "Equity ETFs",
          rows: [
            { key: "Teilfreistellung",                 val: "30% of gains exempt" },
            { key: "To use full \u20ac1.000 allowance", val: "Realize ~\u20ac1.428 gross" },
            { key: "Gains above allowance",             val: "Only 70% taxed" },
            { key: "Volatility risk on harvest",        val: "Lower (diversified)" }
          ]
        },
        {
          badge: "More complex", tone: "sub",
          title: "Individual stocks",
          rows: [
            { key: "Teilfreistellung",                 val: "None" },
            { key: "To use full \u20ac1.000 allowance", val: "Realize \u20ac1.000 exactly" },
            { key: "Gains above allowance",             val: "100% taxed" },
            { key: "Volatility risk on harvest",        val: "Higher (event risk)" }
          ]
        }
      ],
      tip: "*Key takeaway:* Individual stocks are simpler to calculate within the allowance, " +
           "but ETFs are more tax-efficient for the larger portfolio because of the 30% partial " +
           "exemption on everything above the allowance. Both dividends and gains from individual " +
           "stocks are fully taxable with no exemption."
    },

    /* ---- KEY RULES ----------------------------------------------------- */
    {
      label: "Important rules",
      title: "Things Germany does (and doesn't) have",
      rules: [
        {
          icon: "ban",
          text: "*No wash-sale rule.* You can sell an ETF and immediately rebuy the exact same " +
                "one. The gain is fully and validly realized. No waiting period required \u2014 " +
                "unlike in the US."
        },
        {
          icon: "sort",
          text: "*FIFO applies.* When selling a position you've been adding to over time, " +
                "Germany always deems your oldest shares sold first. This is usually helpful \u2014 " +
                "older shares have the largest gains to step up."
        },
        {
          icon: "merge",
          text: "*Losses offset gains.* If you sell a losing position in the same year, those " +
                "losses net against your realized gains. This means you could harvest more than " +
                "\u20ac1.000 gross from winners and still land at \u20ac1.000 net \u2014 fully " +
                "covered by the allowance."
        },
        {
          icon: "coin",
          text: "*Vorabpauschale eats into the allowance.* Accumulating ETFs have an annual " +
                "advance lump-sum tax even without distributions. This counts against your " +
                "\u20ac1.000, so check how much remains before deciding how much to harvest."
        },
        {
          icon: "receipt",
          text: "*No holding-period distinction.* Germany has no equivalent of the US short-term " +
                "/ long-term capital gains split. The flat 26.375% applies to all gains regardless " +
                "of how long you've held the asset."
        }
      ]
    }
  ],

  footer: "This summary reflects German tax law as of June 2026. Tax rules can change \u2014 verify " +
          "with a Steuerberater for personal advice."
};
