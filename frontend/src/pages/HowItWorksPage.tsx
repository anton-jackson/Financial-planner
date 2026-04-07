export function HowItWorksPage() {
  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-2">How the Engine Works</h2>
      <p className="text-slate-500 text-sm mb-8">
        A detailed explanation of every calculation behind the projections.
      </p>

      <div className="flex flex-col gap-8">
        {/* Overview */}
        <Section title="Overview">
          <P>
            The engine runs a <strong>year-by-year deterministic cashflow projection</strong> from the current year
            through your life expectancy. Each year it calculates income, expenses, taxes, savings, investment returns,
            and portfolio withdrawals — producing a complete financial trajectory.
          </P>
          <P>
            <strong>Monte Carlo</strong> mode runs this same projection 2,000-5,000 times with randomized market
            returns, inflation, bonus variability, and RSU volatility — producing a fan of possible outcomes with
            percentile bands and a success rate.
          </P>
          <P>
            The <strong>Dashboard</strong> shows your baseline (current trajectory with no scenario events). <strong>Scenarios</strong> are
            self-contained sandboxes where you can add large purchases, life events, and different assumptions to
            explore "what if" questions.
          </P>
        </Section>

        {/* Timeline */}
        <Section title="Projection Timeline">
          <BulletList items={[
            "Start year: current year (2026).",
            "Retirement year: birth_year + retirement_age. This is when salary, bonus, 401k contributions, and RSU refresh grants stop.",
            "End year: birth_year + life_expectancy_age. All charts extend to this year.",
            "Each spouse can have a different retirement age — their income stops independently.",
          ]} />
        </Section>

        {/* Income */}
        <Section title="Income (Pre-Retirement)">
          <SubSection title="Salary & Bonus">
            <P>
              Salary compounds annually: <Code>salary = base_salary × (1 + raise%)^years</Code>.
              Bonus is a percentage of the current salary: <Code>bonus = salary × bonus%</Code>.
              Both are added to gross income and taxed at the pre-retirement effective rate.
            </P>
            <P>
              Spouse income (if present) grows independently at its own raise rate.
            </P>
          </SubSection>

          <SubSection title="RSU Vesting & Sales">
            <P>The RSU model tracks individual lots with cost basis for proper tax treatment:</P>
            <BulletList items={[
              "Stock price compounds year-over-year using a declining growth rate model: the price grows at the initial rate, then linearly transitions to the long-term rate over N transition years.",
              "At vest, the company sells a percentage of shares (sell-to-cover %) to pay tax withholding. You receive the remaining shares. The full vest value is still ordinary income, but the tax is already paid by the withheld shares.",
              "Example: 712 shares vest at $190. At 37% sell-to-cover, 263 shares are sold for withholding (~$50K), and you keep 449 shares worth ~$85K.",
              "Each vested lot stores its cost basis (kept_shares × price at vest). When sold at the lot's sale_year, capital gains = (sale_price - vest_price) × shares, taxed at the LTCG rate.",
              "Annual refresh grants are issued as a dollar value and converted to shares at the current projected price. As the stock price rises, you receive fewer shares per grant.",
              "Refresh grants stop at the earlier of: refresh_end_year or retirement. Vesting and sales continue through retirement.",
              "IMPORTANT: Unvested RSU tranches are NOT counted as assets — they only enter your net worth at the moment they vest. This reflects the reality that unvested RSUs are not owned until vesting.",
              "Unsold vested RSU shares are valued at the current projected price and counted as liquid assets — they're freely sellable. When sold, the proceeds move into your cash/investment portfolio.",
            ]} />
          </SubSection>

          <SubSection title="Declining Growth Rate">
            <P>
              To avoid unrealistic compounding, the RSU stock price uses a glide model:
            </P>
            <BulletList items={[
              "Year 1: grows at the initial rate (e.g. 100%).",
              "Over transition_years: the rate linearly interpolates toward the long-term rate (e.g. 35%).",
              "After transition: grows at the long-term rate indefinitely.",
              "Formula: rate = initial + (long_term - initial) × min(years_elapsed, transition_years) / transition_years.",
            ]} />
          </SubSection>
        </Section>

        {/* Savings */}
        <Section title="Savings & 401k (Pre-Retirement)">
          <BulletList items={[
            "401k contribution rate is applied to total comp (salary + bonus), not just base salary.",
            "Traditional 401k = min(total_comp × rate%, IRS_limit). Any overflow goes to Roth 401k (mega backdoor).",
            "Employer match is calculated on base salary only: salary × match%.",
            "IRA (traditional + Roth), HSA, and additional monthly savings are fixed annual/monthly amounts.",
            "All savings contributions are deducted from cash flow and added to the liquid portfolio.",
            "All savings stop at retirement. No more contributions; the portfolio is in draw-down mode.",
          ]} />
        </Section>

        {/* Expenses */}
        <Section title="Expenses">
          <SubSection title="Living Expenses">
            <BulletList items={[
              "Base living expenses are entered in today's dollars and inflated each year: expense × (1 + inflation%)^years.",
              "Per-child costs are added for each child and drop off when they finish college (if configured).",
              "At retirement, total living expenses are reduced by the retirement_reduction_pct (a one-time step-down).",
              "Excludes mortgage, tuition, and healthcare — those are modeled separately.",
            ]} />
          </SubSection>

          <SubSection title="Housing Costs">
            <BulletList items={[
              "Mortgage P&I: fixed monthly payment. The engine amortizes the balance monthly — each month, interest = balance × monthly_rate, principal = payment - interest.",
              "Property tax, insurance, and carrying costs: entered in today's dollars, inflated annually at general inflation.",
              "These apply to non-rental properties. Rental properties have their own expense model (see below).",
            ]} />
          </SubSection>

          <SubSection title="College">
            <BulletList items={[
              "Annual cost = (tuition + room_and_board) inflated at the college tuition rate — minus financial aid and scholarships.",
              "529 plans grow at 6%/yr with monthly contributions until college starts, then are drawn down each year to offset costs.",
              "Private school tuition (if entered) runs until the school's end year, inflated at general inflation.",
              "Each child's college runs for college_years (default 4). Overlapping college years stack costs.",
            ]} />
          </SubSection>

          <SubSection title="Healthcare">
            <P>Three-phase model, all inflated at the healthcare inflation rate:</P>
            <BulletList items={[
              "Pre-retirement: employer plan = annual_premium + annual_out_of_pocket.",
              "Early retirement (retirement to age 65): ACA marketplace cost (typically higher).",
              "Post-65: Medicare + supplemental costs.",
            ]} />
          </SubSection>
        </Section>

        {/* Vehicles */}
        <Section title="Vehicle Purchases">
          <P>
            Planned car purchases are part of your baseline — they fire in every scenario. Each purchase has a year,
            price, optional trade-in, and a cash vs. financed option.
          </P>
          <BulletList items={[
            "Purchase price and trade-in value are entered in today's dollars and inflated to the purchase year at general inflation.",
            "Cash purchase: net cost (price - trade-in) is deducted from liquid portfolio in the purchase year.",
            "Financed: down payment comes from liquid portfolio. An auto loan is created for the balance with the specified rate and term.",
            "Auto loan payments (P&I) are deducted each year until the loan is paid off. The amortization uses standard monthly compound interest.",
            "Vehicle costs appear as a separate line item in the cashflow breakdown.",
          ]} />
        </Section>

        {/* Taxes */}
        <Section title="Taxes">
          <P>
            The engine uses simplified <strong>effective tax rates</strong> (not marginal brackets):
          </P>
          <BulletList items={[
            "Pre-retirement: income_tax = gross_income × pre_retirement_effective_rate. Gross income includes salary, bonus, and RSU vest income.",
            "LTCG: when vested RSU shares are sold, capital gains = (sale_price - cost_basis) × shares. Taxed at the long_term_cap_gains rate.",
            "Retirement: only portfolio withdrawals from traditional accounts are taxed at the retirement_effective_rate. Roth withdrawals are tax-free.",
            "Social Security: SS_income × ss_taxable_pct is added to taxable retirement income.",
            "Life events: if marked taxable, the appropriate rate (pre-retirement or retirement) is applied.",
          ]} />
        </Section>

        {/* Investment Returns */}
        <Section title="Investment Returns & Portfolio Growth">
          <BulletList items={[
            "Liquid portfolio return = portfolio_balance × weighted_return, where weighted_return = stocks% × stock_mean + bonds% × bond_mean + cash% × 0%.",
            "The asset allocation glides linearly from pre-retirement to post-retirement over the glide_path_start_years_before period.",
            "In retirement, if expenses exceed Social Security + other income, the shortfall is withdrawn from the liquid portfolio.",
            "If SS + rental exceeds expenses, the surplus is added back to the portfolio.",
            "The portfolio cannot go below zero. If it hits zero, you've run out of money (ruin).",
          ]} />
        </Section>

        {/* Real Estate */}
        <Section title="Real Estate">
          <SubSection title="Appreciation">
            <BulletList items={[
              "Each property appreciates annually: value × (1 + appreciation_rate%). If the property has its own rate, that's used; otherwise the scenario's default RE rate.",
              "Equity = property_value - mortgage_balance. Counts as illiquid net worth.",
              "The total/illiquid chart lines include RE equity; the liquid line does not.",
            ]} />
          </SubSection>

          <SubSection title="Large Purchases">
            <BulletList items={[
              "Down payment is deducted from the liquid portfolio in the purchase year.",
              "A new mortgage is created: loan = price × (1 - down_pct%). Monthly payment is computed via standard amortization formula.",
              "Property tax and carrying costs are inflated annually and deducted from cash flow.",
              "100% down = cash purchase. No mortgage, but the full price leaves your liquid portfolio.",
            ]} />
          </SubSection>

          <SubSection title="Rental Properties">
            <BulletList items={[
              "Gross rent = monthly_rent × 12. Effective rent = gross × (1 - vacancy%). Rent grows with general inflation.",
              "Expenses: maintenance (% of property value, grows with appreciation), property management (% of effective rent), mortgage payment (fixed), insurance.",
              "Net rental income = effective_rent - maintenance - management - mortgage - insurance. Only positive cash flow is counted.",
              "Rental income is added to total income and helps offset expenses in retirement.",
            ]} />
          </SubSection>
        </Section>

        {/* Social Security */}
        <Section title="Social Security">
          <BulletList items={[
            "Enter your PIA (Primary Insurance Amount) at age 67 — this is the monthly benefit shown on your SSA statement.",
            "Claiming factor adjusts for early/late claiming: 62 = 70%, 67 = 100%, 70 = 124%. Linear interpolation between.",
            "Annual benefit = monthly_benefit × 12, then grows with COLA (cost-of-living adjustment) each year after claiming.",
            "Benefits begin at the claiming_age you specify. No benefits before that year.",
          ]} />
        </Section>

        {/* Monte Carlo */}
        <Section title="Monte Carlo Simulation">
          <P>
            Monte Carlo runs the deterministic engine thousands of times with randomized inputs to produce a probability
            distribution of outcomes:
          </P>
          <BulletList items={[
            "Stock returns: sampled from N(stocks_mean, stocks_stddev) each trial.",
            "Bond returns: sampled from N(bonds_mean, bonds_stddev) each trial.",
            "Inflation: sampled from N(general_mean, general_stddev) each trial.",
            "Bonus: multiplied by a random factor from N(1.0, bonus_variability%).",
            "RSU price: multiplied by a lognormal random factor based on volatility_pct.",
            "Each trial uses the trial-average of these random draws (not per-year), so variance comes from different market environments, not year-to-year noise.",
          ]} />

          <SubSection title="Output Metrics">
            <BulletList items={[
              "Success rate: % of trials where liquid portfolio stays above $0 through the entire projection.",
              "Probability of ruin: 100% - success_rate.",
              "Percentile bands (p10/p25/p50/p75/p90): net worth and liquid net worth at each year across all trials.",
              "Median terminal net worth: the 50th percentile net worth at end of life.",
              "Years of runway: how many post-retirement years the portfolio lasts (median and percentile bands).",
              "Spending capacity: 4% of liquid portfolio each year (the 4% rule heuristic).",
            ]} />
          </SubSection>
        </Section>

        {/* Charts */}
        <Section title="Understanding the Charts">
          <SubSection title="Three Lines">
            <BulletList items={[
              "Total Net Worth (solid blue): liquid portfolio + real estate equity + vested RSU value + 529 balances.",
              "Liquid (dashed green): cash, investment accounts, and vested RSU shares. This is what you can access — vested RSUs are freely sellable.",
              "Illiquid (dashed amber): real estate equity only. Valuable but not spendable without selling the property.",
            ]} />
          </SubSection>

          <SubSection title="Monte Carlo Fan">
            <BulletList items={[
              "The shaded bands show the range of outcomes across all trials.",
              "p50 (median, darkest): the middle outcome — half of trials are above, half below.",
              "p25-p75: the middle 50% of outcomes. A reasonable planning range.",
              "p10-p90: covers 80% of outcomes. The outer edges are optimistic (p90) and pessimistic (p10) scenarios.",
            ]} />
          </SubSection>
        </Section>

        {/* Dashboard vs Scenarios */}
        <Section title="Dashboard vs. Scenarios">
          <BulletList items={[
            "Dashboard: runs the baseline — your current profile, assets, and scenario assumptions with NO large purchases or life events. Shows your trajectory if nothing changes.",
            "Scenarios: self-contained sandboxes. Each scenario has its own assumptions, purchases, and life events. Use them to compare 'what if' paths.",
            "The baseline always uses the 'base' scenario's market assumptions (returns, inflation, allocation) but strips out purchases and events.",
          ]} />
        </Section>

        {/* Key Assumptions */}
        <Section title="Key Assumptions & Limitations">
          <BulletList items={[
            "Tax model is simplified — effective rates, not marginal brackets. No Roth conversion ladder, no RMDs, no AMT.",
            "No tax-loss harvesting or capital gains on portfolio sales (only RSU sales are tax-tracked).",
            "529 draws are assumed tax-free (used for qualified education expenses).",
            "Cash earns 0% return. In practice you might earn 4-5% in a HYSA.",
            "No Social Security earnings test — you can claim and work simultaneously in the model.",
            "Healthcare costs are a rough three-phase model, not based on actual plan data.",
            "Real estate is illiquid — there's no mechanism to sell a property and recapture equity (planned for future).",
            "Inflation is compound and uniform within each category. No modeling of deflation or supply shocks.",
            "Monte Carlo uses trial-level averages, not per-year sampling. This smooths out within-trial volatility.",
          ]} />
        </Section>
      </div>
    </div>
  );
}

/* ─── Reusable typography components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-800 mb-3 pb-2 border-b border-slate-200">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ml-1">
      <h4 className="text-sm font-medium text-slate-600 mb-2">{title}</h4>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 leading-relaxed">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">{children}</code>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 ml-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-slate-600 leading-relaxed flex gap-2">
          <span className="text-slate-400 mt-1 shrink-0">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
