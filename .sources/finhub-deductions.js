/* ============================================================================
   finhub-deductions.js — FinHub content module (self-registering)
   ----------------------------------------------------------------------------
   Adds the "Deductions" tab to FinHub. Edit text/numbers only.
   Conventions:
     • German numeric notation: thousands "." and decimals "," (e.g. 1.230, 0,38).
     • A space before % and units (e.g. 20 %).
     • Headings and sub-headings in Title Case.
     • *bold* and _italic_ inline emphasis.
   ========================================================================== */
(window.FINHUB = window.FINHUB || { tabs: [] }).tabs.push({
  id: "deductions",
  label: "Deductions",
  eyebrow: "Reference Guide \u00b7 Germany",
  title: "Major Deductions & Allowances",
  subtitle: "What lowers your taxable income, and two ways to play it",

  sections: [

    /* ---- THE BIG PICTURE ---------------------------------------------- */
    {
      label: "The Big Picture",
      title: "Allowances You Get Automatically",
      metrics: [
        { label: "Grundfreibetrag", value: "\u20ac12.348", sub: "tax-free (2026, single)" },
        { label: "Work-Cost Lump Sum", value: "\u20ac1.230", sub: "Arbeitnehmer-Pauschbetrag" },
        { label: "Special-Expense Lump Sum", value: "\u20ac36", sub: "\u20ac72 for couples" },
        { label: "Saver's Allowance", value: "\u20ac1.000", sub: "capital income" }
      ],
      note: "German income tax is charged on your *taxable income* \u2014 income minus work costs " +
            "(Werbungskosten), special expenses (Sonderausgaben), extraordinary burdens and allowances. " +
            "Some amounts are granted automatically through payroll; anything beyond them only counts if " +
            "you file a return and claim it. The lump sums above are applied without any proof."
    },

    /* ---- WHAT YOU CAN CLAIM ------------------------------------------- */
    {
      label: "If You File",
      title: "What You Can Claim",
      rules: [
        {
          icon: "car",
          text: "*Werbungskosten (Above \u20ac1.230).* The commuter allowance is 0,38 \u20ac per kilometre " +
                "from the first kilometre (2026); the home-office flat rate is \u20ac6 per day, up to \u20ac1.260 " +
                "(210 days). Also work equipment, training, double household and a \u20ac964 relocation lump sum."
        },
        {
          icon: "coin",
          text: "*Sonderausgaben \u2014 Provision.* Basic health and long-term-care contributions are fully " +
                "deductible, and old-age provision is 100 % deductible since 2023, up to roughly \u20ac30.826 " +
                "(singles) / \u20ac61.652 (couples) in 2026. Riester counts up to \u20ac2.100."
        },
        {
          icon: "heart",
          text: "*Sonderausgaben \u2014 Other.* Church tax; donations up to 20 % of your total income (excess " +
                "carries to the next year); childcare at 80 %, max \u20ac4.800 per child (since 2025)."
        },
        {
          icon: "tool",
          text: "*§35a Tax Credits.* Subtracted directly from the tax owed: household-related services 20 %, " +
                "max \u20ac4.000; tradesperson _labour_ 20 %, max \u20ac1.200 (materials don't count)."
        }
      ],
      warn: "*Pay By Bank Transfer.* §35a credits require payment to the provider's account \u2014 cash is " +
            "never credited \u2014 and they only reduce tax you actually owe, with no refund beyond it."
    },

    /* ---- TWO STRATEGIES ----------------------------------------------- */
    {
      label: "Two Strategies",
      title: "Tax-Optimised vs. No-Work Default",
      compare: [
        {
          badge: "Recommended", tone: "best",
          title: "Tax-Optimised",
          rows: [
            { key: "Effort",   val: "File a return, keep receipts" },
            { key: "Moves",    val: "Itemise, claim §35a, time spend" },
            { key: "Best For", val: "Commuters, home office, donors, owners" },
            { key: "Upside",   val: "Often several hundred \u20ac back" }
          ]
        },
        {
          badge: "Zero Effort", tone: "sub",
          title: "No-Work Default",
          rows: [
            { key: "Effort",    val: "None \u2014 automatic via payroll" },
            { key: "You Get",   val: "Grundfreibetrag + lump sums" },
            { key: "Best For",  val: "Costs clearly below the lump sums" },
            { key: "Trade-Off", val: "Extra costs are simply lost" }
          ]
        }
      ],
      tip: "*How To Decide:* If your real work costs, household-service bills, donations and insurance clearly " +
           "stay under the lump sums, the default is fine. Once they exceed them \u2014 a commute, home office, " +
           "tradesperson bills \u2014 filing typically pays. The assessment automatically applies whichever is " +
           "more favourable (Günstigerprüfung), so filing never makes you worse off."
    }
  ]
});
