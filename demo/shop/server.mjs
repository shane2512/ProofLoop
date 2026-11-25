// A deliberately tiny demo storefront for the ProofLoop closed-loop demo. No dependencies.
//   node demo/shop/server.mjs [port]      (default 4100, loopback only)
//
// Demo account: standard_user / secret_sauce. After a valid login the app sends the browser to the
// inventory page, which must show a "Products" heading and products with an "Add to cart" button.
import http from "node:http";

const port = Number(process.argv[2] ?? 4100);

// The page that lists products is served at /inventory.
const INVENTORY_PATH = "/inventory";

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px}label{display:block;margin:12px 0 4px}
input{padding:8px;width:100%;box-sizing:border-box}button{margin-top:16px;padding:10px 16px}.item{border:1px solid #ccc;padding:12px;margin:8px 0}</style>
</head><body>${body}</body></html>`;

const loginPage = page(
  "Demo Shop: Login",
  `<h1>Demo Shop</h1>
<form method="post" action="/login">
  <label for="user-name">Username</label><input id="user-name" name="user" type="text" autocomplete="off">
  <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="off">
  <button id="login-button" type="submit">Login</button>
</form>`,
);

const inventoryPage = page(
  "Demo Shop: Products",
  `<h1>Products</h1>
<div class="item"><h2>Backpack</h2><button>Add to cart</button></div>
<div class="item"><h2>Bike Light</h2><button>Add to cart</button></div>
<div class="item"><h2>Bolt T-Shirt</h2><button>Add to cart</button></div>`,
);

const notFound = page("Not found", "<h1>Page not found</h1><p>The page you asked for does not exist.</p>");

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const send = (status, html) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };

  if (req.method === "GET" && url.pathname === "/") return send(200, loginPage);
  if (req.method === "GET" && url.pathname === INVENTORY_PATH) return send(200, inventoryPage);

  if (req.method === "POST" && url.pathname === "/login") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const form = new URLSearchParams(body);
      const ok = form.get("user") === "standard_user" && form.get("password") === "secret_sauce";
      if (!ok) return send(401, page("Demo Shop: Login", `<h1>Demo Shop</h1><p role="alert">Username and password do not match.</p>${loginPage.split("<h1>Demo Shop</h1>")[1] ?? ""}`));
      res.writeHead(303, { location: "/products" });
      res.end();
    });
    return;
  }

  return send(404, notFound);
});

server.listen(port, "127.0.0.1", () => console.log(`Demo shop on http://127.0.0.1:${port}/`));
