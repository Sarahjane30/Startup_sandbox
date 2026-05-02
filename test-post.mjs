import fs from 'fs';
async function test() {
  try {
    const res = await fetch("http://localhost:3000/api/analyze-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: "Ai for education" })
    });
    const text = await res.text();
    fs.writeFileSync('debug.json', text);
  } catch (err) {
    fs.writeFileSync('debug.json', err.message);
  }
}
test();
