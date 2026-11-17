-- Length-bias check for gold_main_break_risk.risk_score (credibility-weighted breaks per km per year).
-- Healthy result: avg_length_m similar across tiers, corr_risk_score_vs_length near 0,
-- and breaks_per_km_yr clearly higher for High than Medium than Low.
SELECT risk_tier,
       count(*) AS segments,
       round(avg(length_m)) AS avg_length_m,
       round(avg(breaks_total), 2) AS avg_breaks,
       round(sum(breaks_total) / sum(length_m / 1000.0) / max(years_observed), 2) AS breaks_per_km_yr,
       round(avg(risk_score), 3) AS avg_risk_score,
       (SELECT round(corr(risk_score, length_m), 3) FROM adllabs_096.water_utilities_medallion.gold_main_break_risk) AS corr_risk_score_vs_length
FROM adllabs_096.water_utilities_medallion.gold_main_break_risk
GROUP BY risk_tier
ORDER BY CASE risk_tier WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END
