// Syntax check for .jsx/.js files without a full build (several people can run it at once):
//   node scripts/check-jsx.cjs app/page.jsx app/calendar/page.jsx
const fs = require("fs");
const { transform } = require("sucrase");
let bad = 0;
for (const f of process.argv.slice(2)) {
  try {
    transform(fs.readFileSync(f, "utf8"), { transforms: ["jsx", "imports"], filePath: f });
    console.log("ok   " + f);
  } catch (e) {
    bad++;
    console.log("FAIL " + f + ": " + e.message);
  }
}
process.exit(bad ? 1 : 0);
