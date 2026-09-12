// build/fix-gui.js
// 将 node SEA 生成的 exe 的 PE Subsystem 从 CONSOLE 改为 GUI，实现无黑框运行
// 运行方式: node build/fix-gui.js 店长宝.exe
const fs = require('fs');
const path = require('path');

function fixGui(exePath) {
  if (!fs.existsSync(exePath)) {
    console.error('文件不存在: ' + exePath);
    process.exit(1);
  }
  const buf = fs.readFileSync(exePath);

  // 校验 PE 签名
  const peOffset = buf.readUInt32LE(0x3C);
  if (buf.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    console.error('不是有效的 PE 文件');
    process.exit(1);
  }

  // COFF header 之后是 Optional header
  const optOffset = peOffset + 4 + 20; // 4=PE sig + 20=COFF header
  const magic = buf.readUInt16LE(optOffset);
  if (magic !== 0x20B && magic !== 0x10B) {
    console.error('未知 Optional header magic: 0x' + magic.toString(16));
    process.exit(1);
  }

  // Subsystem 在 Optional header 偏移 68 (0x44) —— 对 PE32 和 PE32+ 相同
  const subOffset = optOffset + 68;
  const oldSub = buf.readUInt16LE(subOffset);
  if (oldSub === 2) {
    console.log('已经是 GUI 模式，无需修改');
    return;
  }
  console.log('当前 Subsystem: ' + oldSub + ' (' + (oldSub === 3 ? 'CONSOLE' : '未知') + ')');

  // Windows GUI = 2, Windows CUI = 3
  buf.writeUInt16LE(2, subOffset);

  // PE checksum (optional, set to 0)
  const checkSumOffset = optOffset + 64;
  buf.writeUInt32LE(0, checkSumOffset);

  fs.writeFileSync(exePath, buf);
  console.log('已修改为 GUI 模式（无控制台窗口）');
  console.log('输出: ' + path.resolve(exePath));
}

const target = process.argv[2] || path.join(__dirname, '..', '店长宝.exe');
fixGui(target);