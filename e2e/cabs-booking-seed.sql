-- Fares for the demo cab business (sri-murugan), so a customer can book: one vehicle class, an airport rate card, and the rules.
INSERT INTO vehicle_classes (dealer_id, name, seats, bags, ac, sort_order)
SELECT id, 'Sedan', 4, 2, true, 1 FROM dealers WHERE slug = 'sri-murugan'
ON CONFLICT (dealer_id, name) DO NOTHING;

INSERT INTO rate_cards (dealer_id, vehicle_class_id, trip_type, base_paise, per_km_paise, active)
SELECT d.id, c.id, 'airport', 20000, 1400, true
FROM dealers d JOIN vehicle_classes c ON c.dealer_id = d.id AND c.name = 'Sedan'
WHERE d.slug = 'sri-murugan'
  AND NOT EXISTS (SELECT 1 FROM rate_cards r WHERE r.dealer_id = d.id AND r.trip_type = 'airport');

INSERT INTO cab_settings (dealer_id, gst_rate_bps, state_code, min_lead_minutes, respond_window_minutes, unpaid_hold_minutes)
SELECT id, 500, '33', 60, 30, 20 FROM dealers WHERE slug = 'sri-murugan'
ON CONFLICT (dealer_id) DO UPDATE SET gst_rate_bps = 500, state_code = '33', min_lead_minutes = 60;
