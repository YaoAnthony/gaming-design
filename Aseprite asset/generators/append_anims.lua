-- 往已有的 .aseprite 末尾追加几段动作（不动别的帧：手改过的源文件也能用）。同名标签已经有了就先删掉它那几帧再加
-- 用法: Aseprite.exe -b --script-param spec=<anims.json> --script-param file=<file.aseprite> --script append_anims.lua
-- spec 和 pack_anims.lua 一样：{ w, h, anims: [{ tag, files: [路径], ms: [...] }] }（只有一层，帧画在第一层）
local f = io.open(app.params["spec"], "r")
local spec = json.decode(f:read("a"))
f:close()
local spr = app.open(app.params["file"])
local layer = spr.layers[1]

for _, anim in ipairs(spec.anims) do
  -- 同名标签：删掉它占的帧（从后往前删）和标签
  for _, tag in ipairs(spr.tags) do
    if tag.name == anim.tag then
      local from, to = tag.fromFrame.frameNumber, tag.toFrame.frameNumber
      spr:deleteTag(tag)
      for i = to, from, -1 do spr:deleteFrame(i) end
      break
    end
  end
  -- 在最后一个标签后面加帧，Aseprite 会把那个标签自动撑大：先记下原来每个标签的范围，加完再改回去
  local keep = {}
  for _, tag in ipairs(spr.tags) do keep[#keep + 1] = { tag, tag.fromFrame.frameNumber, tag.toFrame.frameNumber } end
  local from = #spr.frames + 1
  for i, path in ipairs(anim.files) do
    local fr = spr:newEmptyFrame(#spr.frames + 1)
    spr:newCel(layer, fr.frameNumber, Image { fromFile = path }, Point(0, 0))
    fr.duration = anim.ms[i] / 1000
  end
  for _, k in ipairs(keep) do
    k[1].fromFrame = spr.frames[k[2]]
    k[1].toFrame = spr.frames[k[3]]
  end
  spr:newTag(from, #spr.frames).name = anim.tag
end
spr:saveAs(app.params["file"])
print("saved " .. app.params["file"] .. " frames=" .. #spr.frames)
