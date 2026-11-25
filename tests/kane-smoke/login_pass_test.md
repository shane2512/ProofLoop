---
mode: testing
url: https://www.saucedemo.com/
max_steps: 20
---

# Smoke: login reaches inventory (expected to PASS)

## Open the login page
Open https://www.saucedemo.com/ and verify the Login button is visible.

## Sign in with the public demo account
Type "standard_user" into the Username field and "secret_sauce" into the Password field, then click Login.
Verify the page shows the "Products" heading and at least one product with an "Add to cart" button.
