/**
 * Example Kane test files shown on /test-examples. Each carries an honest label for what is known about it.
 *
 * - `ran-pass` and `ran-fail`: these are byte-for-byte the files that were run through the real Kane CLI (kane-cli 0.10.9)
 *   and gave that result. `tests/test-examples.test.ts` fails if they drift from the files in the repository.
 * - `untested`: written in the same shape but not run through Kane by the author. Adjust them to your app.
 *
 * Kane stops with exit code 2 on a front matter key it does not know. Only the keys in `KNOWN_KEYS` are used here, because
 * those are the ones that ran. Kane may accept others; this list is what was tested, not a complete list.
 */
export const KNOWN_KEYS = ["mode", "url", "max_steps"] as const;

export type ExampleStatus = "ran-pass" | "ran-fail" | "untested";

export interface TestExample {
  id: string;
  title: string;
  status: ExampleStatus;
  /** What this example shows and how it was checked. */
  note: string;
  /** A name to give it in ProofLoop. The editor adds `_test.md`. */
  name: string;
  content: string;
}

export const STATUS_LABEL: Record<ExampleStatus, string> = {
  "ran-pass": "Run with real Kane: passed",
  "ran-fail": "Run with real Kane: failed on purpose",
  untested: "Not run by us",
};

export const MINIMAL: TestExample = {
  id: "minimal",
  title: "The smallest test",
  status: "untested",
  note: "The shape every test has: a settings block, a title, and one or more steps. Replace the address and the sentences with your own.",
  name: "my_first",
  content: `---
mode: testing
url: https://your-app.example/
max_steps: 20
---

# What this test proves, in one line

## Open the page
Open https://your-app.example/ and verify the page loads and shows the main heading.

## Do one thing, then check one thing
Click the "Sign up" button.
Verify a form with an "Email" field is shown.
`,
};

export const EXAMPLES: TestExample[] = [
  {
    id: "login-pass",
    title: "Log in and reach the products page",
    status: "ran-pass",
    note: "Run through the real Kane CLI against the public demo shop saucedemo.com and it passed. The account below is that site's published demo account.",
    name: "login",
    content: `---
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
`,
  },
  {
    id: "deliberate-fail",
    title: "A test that is meant to fail",
    status: "ran-fail",
    note: "Run through the real Kane CLI and it failed (exit code 1), as intended. Useful to see what a failure and Kane's own diagnosis look like in ProofLoop before you rely on a pass.",
    name: "fails_on_purpose",
    content: `---
mode: testing
url: https://www.saucedemo.com/
max_steps: 20
---

# Smoke: deliberate failing assertion (expected to FAIL)

## Open the login page
Open https://www.saucedemo.com/ and verify the Login button is visible.

## Verify content that does not exist
Verify the page shows a heading that reads exactly "ProofLoop Deliberate Failure 7431".
`,
  },
  {
    id: "demo-shop",
    title: "Test an app running on your own computer",
    status: "ran-pass",
    note: "The test used by the repository's closed-loop demo (demo/README.md), against the small demo shop on port 4100. It failed while the shop had its planted bug and passed after the fix. It shows that Kane can test a local address.",
    name: "login",
    content: `---
mode: testing
url: http://127.0.0.1:4100/
max_steps: 20
---

# Demo shop: login reaches the products page

## Open the login page
Open http://127.0.0.1:4100/ and verify the Login button is visible.

## Sign in with the demo account
Type "standard_user" into the Username field and "secret_sauce" into the Password field, then click Login.
Verify the page shows the "Products" heading and at least one product with an "Add to cart" button.
`,
  },
  {
    id: "wrong-password",
    title: "A wrong password is rejected",
    status: "untested",
    note: "A negative test: the expected behavior is that something does not happen. Same shape as the tests that ran; check Kane's real result and adjust the wording to your own app.",
    name: "wrong_password",
    content: `---
mode: testing
url: https://www.saucedemo.com/
max_steps: 20
---

# A wrong password does not log the user in

## Try a wrong password
Open https://www.saucedemo.com/.
Type "standard_user" into the Username field and "not_the_password" into the Password field, then click Login.
Verify an error message is shown and the "Products" heading is not shown.
`,
  },
  {
    id: "add-to-cart",
    title: "Add an item to the cart",
    status: "untested",
    note: "A test with two steps that depend on each other. Keep steps in the order a person would do them. Check Kane's real result and adjust the wording to your own app.",
    name: "add_to_cart",
    content: `---
mode: testing
url: https://www.saucedemo.com/
max_steps: 20
---

# Adding an item shows it in the cart

## Sign in
Type "standard_user" into the Username field and "secret_sauce" into the Password field, then click Login.
Verify the page shows the "Products" heading.

## Add an item
Click "Add to cart" on the first product.
Verify the cart icon shows the number 1.
`,
  },
];

export const RULES: string[] = [
  "Start with the settings block between the two --- lines. The examples here use only mode, url and max_steps, which is what we tested. Kane refuses a key it does not know (a made-up key stopped it with exit code 2 and an \u201Cunknown config key\u201D message), so check Kane's own documentation before adding any other setting.",
  "Give the file a title line that starts with # and one heading that starts with ## for each step.",
  "Write each step the way you would tell a person: one thing to do, then one thing to check. Quote the exact words on screen, such as the \"Products\" heading or the \"Login\" button.",
  "One test checks one thing. If the criterion has two parts, write two criteria and two test files, so a failure points at one of them.",
  "A test file is plain text, and Kane uploads each run to your Test Manager. Use demo or test accounts only. Never put a real password or token in one.",
  "Name the file with letters, digits, - or _. In ProofLoop you type just the name (for example login) and it saves login_test.md for you.",
  "Editing a test after it passed makes its criterion Unverified until it passes again. That is on purpose.",
  "The first run of a new test is authored by Kane and can take two to four minutes and uses credits. A repeat run of an unchanged test can replay what Kane recorded, which took 63 seconds against 129 seconds for the first run in our first trial. Your times will differ.",
];
