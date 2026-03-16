const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const svg = fs.readFileSync(path.join(__dirname, 'public/groove-icon.svg'))
const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

// Make sure icons folder exists
if (!fs.existsSync(path.join(__dirname, 'public/icons'))) {
  fs.mkdirSync(path.join(__dirname, 'public/icons'), { recursive: true })
}

sizes.forEach(size => {
  const out = path.join(__dirname, 'public/icons/icon-' + size + 'x' + size + '.png')
  sharp(svg).resize(size, size).png().toFile(out, (err) => {
    if (err) console.error('Error ' + size + ':', err.message)
    else console.log('Generated ' + size + 'x' + size)
  })
})

// Also generate the manifest + apple touch icon versions
sharp(svg).resize(192, 192).png().toFile(path.join(__dirname, 'public/web-app-manifest-192x192.png'), () => console.log('Generated manifest 192'))
sharp(svg).resize(512, 512).png().toFile(path.join(__dirname, 'public/web-app-manifest-512x512.png'), () => console.log('Generated manifest 512'))
sharp(svg).resize(180, 180).png().toFile(path.join(__dirname, 'public/apple-touch-icon.png'), () => console.log('Generated apple-touch-icon'))
sharp(svg).resize(96, 96).png().toFile(path.join(__dirname, 'public/favicon-96x96.png'), () => console.log('Generated favicon'))