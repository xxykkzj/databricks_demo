-- Account holder name is intentionally excluded (personal information not needed downstream).
CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_customer_accounts (
  CONSTRAINT account_id_not_null EXPECT (account_id IS NOT NULL) ON VIOLATION FAIL UPDATE,
  CONSTRAINT has_property EXPECT (dma_id IS NOT NULL),
  CONSTRAINT has_meter EXPECT (meter_id IS NOT NULL)
)
COMMENT 'One row per customer account, joined to its property, meter, DMA and region.'
AS SELECT
  a.account_id,
  a.property_id,
  a.holder_type,
  a.tariff_code,
  a.concession_card,
  a.hardship_flag,
  a.opened_on,
  a.billing_cycle,
  p.property_type,
  p.suburb,
  p.postcode,
  p.dma_id,
  d.region_id,
  r.region_name,
  m.meter_id,
  m.meter_type,
  m.meter_make,
  m.meter_batch,
  m.install_year AS meter_install_year,
  m.bench_error_pct
FROM water_utilities_medallion.bronze_accounts a
LEFT JOIN water_utilities_medallion.bronze_properties p ON a.property_id = p.property_id
LEFT JOIN water_utilities_medallion.bronze_district_metered_areas d ON p.dma_id = d.dma_id
LEFT JOIN water_utilities_medallion.bronze_service_regions r ON d.region_id = r.region_id
LEFT JOIN water_utilities_medallion.bronze_meters m ON m.property_id = a.property_id;
