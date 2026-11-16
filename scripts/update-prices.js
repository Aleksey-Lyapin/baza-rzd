// Обновляет цены БАЗА-РЖД (DATA.rzd в index.html) из Google-таблицы «РЖД: прайс, планы, ДЦО», лист «Прайс».
// Запуск: node scripts/update-prices.js [путь к CSV]  (без аргумента — скачивает лист)
const fs = require("fs");
const path = require("path");

const SHEET_ID = "1s5SzSQ4WV298h6zmj2yea-I3_xoHd4fYuhlNtdC7YhQ";
const GID = "1558074038"; // лист «Прайс»
const HTML = path.join(__dirname, "..", "index.html");

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const num = s => { const v = parseFloat(String(s).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")); return isFinite(v) ? v : NaN; };
const ROOMS = { "Студии": "st", "Студия": "st" };
const roomCode = s => ROOMS[s.trim()] || (s.match(/^(\d)/) || [])[1];

async function main() {
  const csv = process.argv[2]
    ? fs.readFileSync(process.argv[2], "utf8")
    : await (await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`)).text();
  const rows = parseCSV(csv);
  const h = rows.findIndex(r => r[0] && r[0].startsWith("Порядковый номер"));
  if (h < 0) throw new Error("Не найдена строка заголовков листа «Прайс»");
  const H = rows[h].map(x => x.trim());
  const col = name => { const i = H.indexOf(name); if (i < 0) throw new Error("Нет столбца: " + name); return i; };
  const cSec = col("Секция"), cRooms = col("Количество комнат"), cArea = col("Площадь с коэф 0,3/0,5"),
        cPrice = col("Цена с макс. скидкой (цена индекса)"), cRough = col("Черновая отделка");

  const html = fs.readFileSync(HTML, "utf8");
  const rough = +(html.match(/"rough":(\d+)/) || [])[1] || 8000; // поправка на черновую отделку, ₽/м²

  const out = [];
  for (const r of rows.slice(h + 1)) {
    if (!/^\d+$/.test((r[0] || "").trim())) continue;
    const sec = num(r[cSec]), area = num(r[cArea]), price = Math.round(num(r[cPrice])), rc = roomCode(r[cRooms] || "");
    if (!rc || !(sec > 0) || !(area > 0) || !(price > 0)) throw new Error(`Строка ${r[0]}: не разобраны данные (${r[cSec]}, ${r[cRooms]}, ${r[cArea]}, ${r[cPrice]})`);
    const isRough = (r[cRough] || "").trim().toLowerCase() === "да";
    out.push([rc, area, price, isRough ? Math.round(price + rough * area) : price, sec]);
  }
  if (out.length < 300) throw new Error("Слишком мало лотов: " + out.length);

  const re = /"rzd":\[\[.*?\]\]/;
  if (!re.test(html)) throw new Error("В index.html не найден блок DATA.rzd");
  const d = new Date(Date.now() + 5 * 3600e3); // Екатеринбург
  const pdate = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  let next = html.replace(re, `"rzd":${JSON.stringify(out)}`);
  if (next === html) { console.log("Цены не изменились"); return; }
  next = next.replace(/"pdate":"[^"]*"/, `"pdate":"${pdate}"`);
  fs.writeFileSync(HTML, next);
  const sum = out.reduce((s, r) => s + r[2], 0), ar = out.reduce((s, r) => s + r[1], 0);
  console.log(`Обновлено: ${out.length} лотов, ${(sum / 1e9).toFixed(2)} млрд ₽, ${(sum / ar / 1000).toFixed(1)} тыс. ₽/м²`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
