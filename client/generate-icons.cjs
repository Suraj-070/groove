const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const svg = fs.readFileSync(path.join(__dirname, 'public/groove-icon.svg'))
const iconsDir = path.join(__dirname, 'public/icons')

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

sizes.forEach(size => {
  const out = path.join(iconsDir, `icon-${size}x${size}.png`)
  sharp(svg).resize(size, size).png().toFile(out, (err) => {
    if (err) console.error(`Error ${size}:`, err.message)
    else console.log(`✓ Generated icons/icon-${size}x${size}.png`)
  })
})

console.log('\nAll icons go into public/icons/')
console.log('manifest.json and sw.js already reference /icons/icon-*.png')
console.log('Deploy the whole public/ folder to Vercel.')
