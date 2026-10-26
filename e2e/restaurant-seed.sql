-- A small TanyEats restaurant for the ordering journey (e2e/restaurant-order.spec.ts). Run once on the e2e database after `pnpm db:seed`.
-- Orders are accepted with the default settings (cash on pickup); the business is on the free plan so billing never blocks the storefront.
INSERT INTO dealers (slug, display_name, industry, plan, city, phone, theme)
VALUES ('eats-e2e', 'E2E Kitchen', 'restaurants', 'free', 'Chennai', '+919876500001',
        '{"primary":"#b45309","primaryForeground":"#ffffff","accent":"#f59e0b","radius":"md"}')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO menu_categories (dealer_id, name)
SELECT id, 'Tiffin' FROM dealers WHERE slug = 'eats-e2e'
  AND NOT EXISTS (SELECT 1 FROM menu_categories c WHERE c.dealer_id = dealers.id AND c.name = 'Tiffin');

INSERT INTO menu_items (dealer_id, category_id, name, description, price)
SELECT d.id, c.id, v.name, v.descr, v.price
FROM dealers d
JOIN menu_categories c ON c.dealer_id = d.id AND c.name = 'Tiffin'
CROSS JOIN (VALUES ('Masala Dosa', 'Crisp dosa with potato masala', 90), ('Filter Coffee', 'Strong South Indian coffee', 30)) AS v(name, descr, price)
WHERE d.slug = 'eats-e2e'
  AND NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.dealer_id = d.id AND m.name = v.name);
