#!/usr/bin/env python3
"""Fill empty / non-Arabic Product.alias for all known menu items; print remaining gaps."""
from __future__ import annotations

import json
import os
import sys

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"

# Exact English name (case-insensitive) → Arabic alias
EXACT = {
    "Onion Rings": "حلقات البصل",
    "Coleslaw": "كول سلو",
    "Garlic Bread": "خبز بالثوم",
    "Classic pizza": "بيتزا كلاسيك",
    "Classic Pizza": "بيتزا كلاسيك",
    "French Fries": "بطاطس مقلية",
    "Fries": "بطاطس",
    "Chicken Biryani": "برياني دجاج",
    "Mutton Biryani": "برياني لحم",
    "Veg Biryani": "برياني خضار",
    "Chicken Burger": "برجر دجاج",
    "Beef Burger": "برجر لحم",
    "Veg Burger": "برجر خضار",
    "Hummus": "حمص",
    "Mutabbal": "متبل",
    "Fattoush": "فتوش",
    "Chicken Kabsa": "كبسة دجاج",
    "Lamb Mandi": "مندي لحم",
    "Mixed Grill": "مشويات مشكلة",
    "Shish Tawook": "شيش طاووق",
    "Arabic Bread": "خبز عربي",
    "Margherita": "مارغريتا",
    "Pepperoni": "بيبروني",
    "House Lemonade": "ليمونادة",
    "Fresh Orange Juice": "عصير برتقال",
    "Arabic Qahwa": "قهوة عربية",
    "Cappuccino": "كابتشينو",
    "Umm Ali": "أم علي",
    "Kunafa": "كنافة",
    "Water": "ماء",
    "Soft Drink": "مشروب غازي",
    "Tea": "شاي",
    "Coffee": "قهوة",
    "Salad": "سلطة",
    "Green Salad": "سلطة خضراء",
    "Greek Salad": "سلطة يونانية",
    "Caesar Salad": "سلطة سيزر",
    "Soup": "شوربة",
    "Chicken Soup": "شوربة دجاج",
    "Tom Yum": "توم يام",
    "Naan": "نان",
    "Butter Naan": "نان بالزبدة",
    "Garlic Naan": "نان بالثوم",
    "Rice": "أرز",
    "White Rice": "أرز أبيض",
    "Pasta": "باستا",
    "Spaghetti": "سباغيتي",
    "Sandwich": "ساندويتش",
    "Club Sandwich": "كلوب ساندويتش",
    "Shawarma": "شاورما",
    "Chicken Shawarma": "شاورما دجاج",
    "Falafel": "فلافل",
    "Ice Cream": "آيس كريم",
    "Brownie": "براوني",
    "Cheesecake": "تشيز كيك",
    "Orange Juice": "عصير برتقال",
    "Mango Juice": "عصير مانجو",
    "Lassi": "لاسي",
    "Masala Dosa": "ماسالا دوسا",
    "Idli": "إدلي",
    "Vada": "فادا",
    "Samosa": "سمبوسة",
    "Pakora": "بقورة",
    "Butter Chicken": "دجاج بالزبدة",
    "Dal Fry": "دال مقلي",
    "Paneer Tikka": "بنير تكا",
    "Tandoori Chicken": "دجاج تندوري",
    "2 Piece Grilled Crab Cake": "كعكة السلطعون المشوية قطعتان",
    "Cheese Fries": "بطاطس بالجبن",
    "Chicken Fried Rice": "أرز مقلي بالدجاج",
    "Chicken Noodles": "نودلز بالدجاج",
    "Chicken Nuggets": "ناجتس دجاج",
    "Chicken Pizza": "بيتزا دجاج",
    "Chicken Strips": "شرائح دجاج",
    "Chicken Wings": "أجنحة دجاج",
    "Chocolate Cake": "كعكة شوكولاتة",
    "Corn on the Cob": "ذرة مسلوقة",
    "Garden Salad": "سلطة الحديقة",
    "Margherita Pizza": "بيتزا مارغريتا",
    "Mashed Potatoes": "بطاطس مهروسة",
    "Mineral Water": "مياه معدنية",
    "Mozzarella Sticks": "أصابع موزاريلا",
    "Potato Wedges": "أوتاد البطاطس",
    "Steamed Vegetables": "خضروات مطهوة بالبخار",
    "Sweet Potato Fries": "بطاطس حلوة مقلية",
}

# Fuzzy ILIKE patterns for names with extra spaces / variants
PATTERNS = [
    ("%Roti%Curry%", "روتي وكاري"),
    ("%Onion Rings%", "حلقات البصل"),
    ("%Coleslaw%", "كول سلو"),
    ("%Garlic Bread%", "خبز بالثوم"),
    ("%Classic%pizza%", "بيتزا كلاسيك"),
]


def main() -> int:
    payload = json.dumps({"exact": EXACT, "patterns": PATTERNS}, ensure_ascii=False)
    remote = f"""
set -euo pipefail
ENVF=/home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env
if [ -f "$ENVF" ]; then set -a; . "$ENVF"; set +a; fi
export PATH=/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin:$PATH
cd /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api
export ALIASES_JSON={json.dumps(payload)}
node <<'NODE'
const {{ PrismaClient }} = require('@prisma/client')
const {{ exact, patterns }} = JSON.parse(process.env.ALIASES_JSON)
const hasAr = (s) => /[\\u0600-\\u06FF]/.test(String(s || ''))

async function run(label, url) {{
  const p = new PrismaClient({{ datasources: {{ db: {{ url }} }} }})
  try {{
    const all = await p.$queryRawUnsafe(
      `SELECT id, name, alias, code FROM "Product" ORDER BY name`,
    )
    let filled = 0
    for (const row of all) {{
      const name = String(row.name || '').trim()
      const cur = String(row.alias || '').trim()
      if (hasAr(cur) && cur !== name) continue
      let next = exact[name]
      if (!next) {{
        const key = Object.keys(exact).find((k) => k.toLowerCase() === name.toLowerCase())
        if (key) next = exact[key]
      }}
      if (!next) {{
        const hit = patterns.find(([pat]) => {{
          const re = new RegExp('^' + pat.replace(/%/g, '.*') + '$', 'i')
          return re.test(name)
        }})
        if (hit) next = hit[1]
      }}
      if (!next || next === cur) continue
      const r = await p.$executeRawUnsafe(
        `UPDATE "Product" SET alias = $1, "updatedAt" = NOW() WHERE id = $2`,
        next,
        row.id,
      )
      if (r) {{
        filled += Number(r)
        console.log(label, 'filled', name, '→', next)
      }}
    }}
    const remaining = await p.$queryRawUnsafe(
      `SELECT name, alias, code FROM "Product"
       WHERE active = true
         AND (alias IS NULL OR TRIM(alias) = '' OR TRIM(alias) = TRIM(name) OR alias !~ '[\\u0600-\\u06FF]')
       ORDER BY name`,
    )
    console.log(label, 'filled_total', filled, 'still_need_arabic', remaining.length)
    for (const row of remaining) console.log(label, 'NEED', JSON.stringify(row))
    const check = await p.$queryRawUnsafe(
      `SELECT name, alias FROM "Product"
       WHERE name ILIKE '%Onion%' OR name ILIKE '%Coleslaw%' OR name ILIKE '%Garlic%'
       ORDER BY name`,
    )
    for (const row of check) console.log(label, 'CHECK', JSON.stringify(row))
  }} catch (e) {{
    console.log(label, 'ERR', e.message)
  }}
  await p.$disconnect()
}}

;(async () => {{
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) await run(`TENANT:${{r.id}}`, r.databaseUrl || process.env.DATABASE_URL)
  await run('PRIMARY', process.env.DATABASE_URL)
  await control.$disconnect()
}})().catch((e) => {{ console.error(e); process.exit(1) }})
NODE
"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    _, stdout, stderr = client.exec_command(remote, timeout=180)
    sys.stdout.write(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stderr.write(err[-2000:])
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
