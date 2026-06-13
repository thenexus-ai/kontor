/* ============================================================================
   finhub-income-tax.js — FinHub content module (self-registering)
   ----------------------------------------------------------------------------
   Adds the "Income Tax" tab to FinHub. Edit text/numbers only.
   Conventions:
     • German numeric notation: thousands "." and decimals "," (e.g. 12.348, 26,375).
     • A space before % and units (e.g. 42 %).
     • Headings and sub-headings in Title Case.
     • *bold* and _italic_ inline emphasis.
   The `calc` section drives the interactive calculator; its `config` holds the
   verified 2026 figures (§32a EStG tariff, Soli, social-security rates). To
   update for a new tax year, edit the numbers in `config` — the maths lives in
   finance_dashboard.js and reads them from here.
   Sources: Bundesfinanzministerium; §32a EStG (Steuerfortentwicklungsgesetz);
   Sozialversicherungs-Rechengrößenverordnung 2026; BMG (Zusatzbeitrag 2026).
   ========================================================================== */
(window.FINHUB = window.FINHUB || { tabs: [] }).tabs.push({
  id: "income-tax",
  label: "Income Tax",
  eyebrow: "Reference Guide \u00b7 Germany",
  title: "Income Tax Overview",
  subtitle: "The 2026 tariff, what to keep in mind, and a calculator",

  sections: [

    /* ---- CALCULATOR ---------------------------------------------------- */
    {
      kind: "calc",
      label: "Calculator",
      title: "Income Tax Calculator (2026)",
      config: {
        year: 2026,
        /* §32a EStG 2026. zvE is rounded down to whole euro; tax is rounded
           down to whole euro. y = (zvE \u2212 12.348)/10.000; z = (zvE \u2212 17.799)/10.000. */
        tariff: {
          grundfreibetrag: 12348,
          zone2: { upTo: 17799, a: 914.51, b: 1400 },
          zone3: { upTo: 69878, sub: 17799, a: 173.10, b: 2397, c: 1034.87 },
          zone4: { upTo: 277825, rate: 0.42, sub: 11135.63 },
          zone5: { rate: 0.45, sub: 19470.38 }
        },
        /* Solidaritätszuschlag: 5,5 %, only above the Freigrenze, with the
           Milderungszone capping it at 11,9 % of the amount above the Freigrenze. */
        soli: { rate: 0.055, freigrenzeSingle: 20350, freigrenzeMarried: 40700, milderung: 0.119 },
        /* Church tax options (share of income tax). */
        church: { options: [ { label: "None", rate: 0 }, { label: "9 %", rate: 0.09 }, { label: "8 % (BY/BW)", rate: 0.08 } ] },
        /* Employee social-security shares + monthly contribution ceilings (BBG), 2026. */
        social: {
          bbgRvAvMonthly: 8450,      // pension + unemployment ceiling
          bbgKvPvMonthly: 5812.50,   // health + care ceiling
          rvEmployee: 0.093,         // pension 9,3 %
          avEmployee: 0.013,         // unemployment 1,3 %
          kvBaseEmployee: 0.073,     // health base 7,3 %
          zusatzDefault: 0.029,      // avg. health Zusatzbeitrag 2026 (employee pays half)
          pvEmployee: 0.018,         // care 1,8 %
          pvChildlessExtra: 0.006    // childless surcharge (23+), employee-only
        },
        lumpSums: { werbungskosten: 1230, sonderausgaben: 36 }
      }
    },

    /* ---- THE TARIFF ---------------------------------------------------- */
    {
      label: "The 2026 Tariff",
      title: "The Tariff At A Glance",
      metrics: [
        { label: "Grundfreibetrag", value: "\u20ac12.348", sub: "tax-free (single)" },
        { label: "Top Rate (42 %)", value: "\u20ac69.879", sub: "from this taxable income" },
        { label: "\u201eReichensteuer\u201c (45 %)", value: "\u20ac277.826", sub: "from this taxable income" },
        { label: "Soli Threshold", value: "\u20ac20.350", sub: "income tax (single)" }
      ],
      note: "Income tax is charged on your *taxable income* (zu versteuerndes Einkommen) \u2014 " +
            "your income after work costs, special expenses and allowances \u2014 not on gross salary. " +
            "The rate rises progressively: 0 % up to \u20ac12.348, then 14 % climbing to 42 % at " +
            "\u20ac69.879, and 45 % above \u20ac277.826. Couples are taxed by *splitting* (the tariff is " +
            "applied to half the joint income, then doubled)."
    },

    /* ---- WHAT TO KEEP IN MIND ------------------------------------------ */
    {
      label: "Good To Know",
      title: "What To Keep In Mind",
      rules: [
        {
          icon: "percent",
          text: "*Marginal vs. Average Rate.* The top rate applies only to each euro above the " +
                "threshold, not to all your income. At \u20ac80.000 taxable income the marginal rate is " +
                "42 %, but the average rate is only about 28 %."
        },
        {
          icon: "flag",
          text: "*Solidaritätszuschlag.* 5,5 % of your income tax, but for 2026 only once your " +
                "assessed income tax tops \u20ac20.350 (single) / \u20ac40.700 (couples) \u2014 about 90 % " +
                "of taxpayers no longer pay it. It still always applies to the Abgeltungsteuer on capital income."
        },
        {
          icon: "building",
          text: "*Church Tax.* 8 % (Bavaria, Baden-Württemberg) or 9 % (other states) of your income " +
                "tax, if you are a member. It is itself deductible as a special expense."
        },
        {
          icon: "users",
          text: "*Tax Classes.* For couples, the III/V, IV/IV and IV-with-factor combinations only change " +
                "the _monthly_ withholding, not the annual tax. III/V often under-withholds and leads to a " +
                "back-payment; the factor method spreads it most fairly. III and V are being abolished from " +
                "2030, when couples move to IV with factor."
        },
        {
          icon: "calendar",
          text: "*Filing & Deadlines.* The 2025 return is due 31 July 2026 without an adviser, or around " +
                "end of February 2027 with a Steuerberater or Lohnsteuerhilfeverein. You _must_ file if, e.g., " +
                "you had several employers at once, used III/V or IV-with-factor as a couple, or had untaxed " +
                "side income or wage-replacement benefits over \u20ac410. Late filing risks a surcharge of at " +
                "least \u20ac25 per month."
        }
      ]
    },

    /* ---- STRATEGY TIPS ------------------------------------------------- */
    {
      label: "Strategy",
      title: "Strategy Tips",
      rules: [
        {
          icon: "receipt",
          text: "*File Voluntarily When You Have Deductions.* If you are not obliged to file, a voluntary " +
                "return usually ends in a refund and carries no downside \u2014 you can submit it up to four years back."
        },
        {
          icon: "users",
          text: "*Pick The Right Tax Class.* Review your combination and consider the factor method. Switch " +
                "the lower earner to III a few months before parental or sick leave, since those benefits are based on net pay."
        },
        {
          icon: "coin",
          text: "*Bunch Deductible Expenses.* Concentrating larger deductible costs into one calendar year can " +
                "push you past the lump-sum thresholds, where extra spending finally reduces tax."
        },
        {
          icon: "activity",
          text: "*Mind The Marginal Rate.* On bonuses and side income, the marginal rate (up to 42 %) is what " +
                "bites. Remember capital income is taxed separately at the flat Abgeltungsteuer \u2014 see the Investment Tax tab."
        }
      ]
    }
  ]
});
