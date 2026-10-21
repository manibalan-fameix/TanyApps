-- The demo business the dev sign-in opens (lib/auth/dev-bypass.ts), set up as a cab operator on the Starter plan with a trial.
INSERT INTO dealers (slug, display_name, industry, plan, city, phone, theme, trial_ends_at)
VALUES ('sri-murugan', 'Anna Travels', 'cabs', 'starter', 'Chennai', '+919876543210',
        '{"primary":"#1d4ed8","primaryForeground":"#ffffff","accent":"#f59e0b","radius":"md"}', now() + interval '20 days')
ON CONFLICT (slug) DO UPDATE SET industry = 'cabs', plan = 'starter', trial_ends_at = now() + interval '20 days';

-- A second cab business on Pro with a verified custom domain, for the customer-login journey (e2e/cabs-login.spec.ts).
INSERT INTO dealers (slug, display_name, industry, plan, city, phone, theme, trial_ends_at)
VALUES ('kaveri-cabs', 'Kaveri Cabs', 'cabs', 'pro', 'Madurai', '+919812345678',
        '{"primary":"#047857","primaryForeground":"#ffffff","accent":"#f59e0b","radius":"md"}', now() + interval '20 days')
ON CONFLICT (slug) DO UPDATE SET industry = 'cabs', plan = 'pro', trial_ends_at = now() + interval '20 days';
INSERT INTO dealer_domains (dealer_id, hostname, verified_at)
SELECT id, 'cabs.example.test', now() FROM dealers WHERE slug = 'kaveri-cabs'
ON CONFLICT (hostname) DO UPDATE SET verified_at = now();
