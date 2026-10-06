#!/usr/bin/env bash
# 合成音效（需要 ffmpeg），输出到 src/asset/audio/。手工做的音效直接覆盖同名文件就行。
#   bash scripts/gen-sfx.sh
set -euo pipefail
cd "$(dirname "$0")/../src/asset/audio"

# 捡到钥匙：C6 E6 G6 C7 往上走的琶音（正弦 + 一点八度泛音，每个音快速衰减），最后一个音拖长，带一点回声
note() { echo "aevalsrc='(0.6*sin(2*PI*$1*t)+0.22*sin(4*PI*$1*t))*exp(-t*$3)':d=$2:s=44100"; }
ffmpeg -v error -y \
  -f lavfi -i "$(note 1046.5 0.075 26)" \
  -f lavfi -i "$(note 1318.5 0.075 26)" \
  -f lavfi -i "$(note 1568.0 0.075 26)" \
  -f lavfi -i "$(note 2093.0 0.55 7)" \
  -filter_complex "[0][1][2][3]concat=n=4:v=0:a=1,aecho=0.8:0.5:70|140:0.25|0.12,volume=1.8" \
  -ac 1 -ar 44100 -b:a 96k key_pickup.mp3
echo "wrote key_pickup.mp3"
