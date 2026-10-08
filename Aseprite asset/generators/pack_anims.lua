-- 把渲染好的帧装进一个 .aseprite：每段动作一个标签，帧时长照 spec（json）
-- 用法: Aseprite.exe -b --script-param spec=<anims.json> --script-param out=<file.aseprite> --script pack_anims.lua
-- spec: { w, h, layers?: ["back", "front"]（从下往上，默认只有一层 body）,
--         anims: [{ tag, files: [路径 或 {图层名: 路径}], ms: [...], subtags?: [{tag, from, to}] }] }
-- files 里直接写路径的帧放在最上面那层；写成 {图层名: 路径} 的分层放（比如夹子桑夹纸：后片在纸后面、前片在纸前面）
local f = io.open(app.params["spec"], "r")
local spec = json.decode(f:read("a"))
f:close()
local spr = Sprite(spec.w, spec.h, ColorMode.RGB)
local names = spec.layers or { "body" }
local layers = {}
spr.layers[1].name = names[1]
layers[names[1]] = spr.layers[1]
for i = 2, #names do
  local l = spr:newLayer()
  l.name = names[i]
  layers[names[i]] = l
end
local top = names[#names]

local n, ranges = 0, {}
for _, anim in ipairs(spec.anims) do
  local from = n + 1
  for i, entry in ipairs(anim.files) do
    n = n + 1
    if n > 1 then spr:newEmptyFrame() end
    if type(entry) == "string" then entry = { [top] = entry } end
    for name, path in pairs(entry) do
      spr:newCel(layers[name], n, Image { fromFile = path }, Point(0, 0))
    end
    spr.frames[n].duration = anim.ms[i] / 1000
  end
  ranges[#ranges + 1] = { anim.tag, from, n }
  -- 子标签（比如 jump 里的 jump_rise / jump_apex / jump_fall）：from/to 是这段动作里的第几帧（从 0 数）
  for _, sub in ipairs(anim.subtags or {}) do
    ranges[#ranges + 1] = { sub.tag, from + sub.from, from + sub.to }
  end
end
-- 标签要等帧都建完再加：先加的话，后面追加的帧会被并进前一个标签
for _, r in ipairs(ranges) do spr:newTag(r[2], r[3]).name = r[1] end
spr:saveAs(app.params["out"])
print("saved " .. app.params["out"] .. " frames=" .. n .. " layers=" .. #names)
