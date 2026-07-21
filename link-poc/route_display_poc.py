#!/usr/bin/env python3
"""경로 표시 A/B PoC (문서 8장 / 12장 6단계).

기존 TMAP 대중교통 전체정보 응답(api-validation/results/5_tmap_*.json)에서
legs[].passShape.linestring 을 추출해:
  A안: 요약만(시간·환승·요금·주요 수단)
  B안: 지하철·버스 구간 Polyline(모드별 색상, WALK 는 선 없이 텍스트) — 스펙 F17
두 안을 한 화면에서 토글 비교하는 route-display.html 을 생성한다.

표준 라이브러리만 사용. 실행: python3 route_display_poc.py
"""

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
TMAP = BASE.parent / "api-validation" / "results"

ROUTES = [
    ("metro", "강남역 → 부천역 (수도권)"),
    ("suburb", "정왕 → 강남역 (경기 외곽)"),
    ("long", "강남역 → 천안역 (장거리)"),
    ("rural", "충주역 → 청주터미널 (지방권)"),
]
MODE_COLOR = {"SUBWAY": "#2d6cdf", "BUS": "#2aa858", "TRAIN": "#8a4fd0",
              "EXPRESSBUS": "#d08a2a", "AIRPLANE": "#c0392b", "WALK": "#999"}


def parse_linestring(s):
    """'경도,위도 경도,위도 ...' -> [[lon,lat], ...]"""
    pts = []
    for pair in s.split():
        lon, lat = pair.split(",")
        pts.append([float(lon), float(lat)])
    return pts


def extract(tag):
    js = json.loads((TMAP / f"5_tmap_전체정보_{tag}.json").read_text())
    it = js["metaData"]["plan"]["itineraries"][0]
    legs = []
    for leg in it["legs"]:
        mode = leg["mode"]
        line = leg.get("passShape", {}).get("linestring", "")
        legs.append({
            "mode": mode,
            "sectionTime": leg.get("sectionTime", 0),
            "routeName": leg.get("route", ""),
            "startName": leg.get("start", {}).get("name", ""),
            "endName": leg.get("end", {}).get("name", ""),
            "points": parse_linestring(line) if line else [],
        })
    return {
        "totalTime": it["totalTime"], "transferCount": it["transferCount"],
        "totalWalkTime": it.get("totalWalkTime", 0),
        "fare": it.get("fare", {}).get("regular", {}).get("totalFare", 0),
        "legs": legs,
    }


HTML = """<!doctype html><html lang=ko><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>경로 표시 A/B PoC</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#f5f5f5;color:#222}
h1{font-size:18px}.sub{color:#666;font-size:13px;margin-bottom:12px}
.toggle{display:inline-flex;border:1px solid #ccc;border-radius:8px;overflow:hidden;margin-bottom:16px}
.toggle button{border:0;padding:8px 18px;background:#fff;font-size:13px;cursor:pointer}
.toggle button.on{background:#222;color:#fff}
.card{background:#fff;border-radius:10px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.title{font-weight:600;font-size:14px;margin-bottom:6px}
.sum{font-size:13px;color:#333;margin-bottom:8px}
.legs{font-size:12px;color:#555;line-height:1.7}
.chip{display:inline-block;padding:1px 7px;border-radius:4px;color:#fff;font-size:11px;margin-right:4px}
svg{width:100%;height:200px;background:#fafafa;border-radius:8px;border:1px solid #eee}
.legend{font-size:11px;color:#777;margin-top:6px}
</style>
<h1>경로 표시 A/B PoC (문서 8장)</h1>
<div class=sub>A안=요약만 · B안=지하철·버스 Polyline(WALK 는 텍스트). 실제 TMAP 전체정보 응답 4건.</div>
<div class=toggle><button id=ba class=on onclick="setMode('A')">A안 요약만</button><button id=bb onclick="setMode('B')">B안 경로선</button></div>
<div id=root></div>
<script>
var DATA=__DATA__, COLOR=__COLOR__, MODE='A';
function fmt(s){var m=Math.round(s/60);return m+'\\ubd84'}
function projectShared(pts,all,w,h,pad){
 var xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 var minx=Math.min.apply(0,xs),maxx=Math.max.apply(0,xs),miny=Math.min.apply(0,ys),maxy=Math.max.apply(0,ys);
 var s=Math.min((w-2*pad)/((maxx-minx)||1),(h-2*pad)/((maxy-miny)||1));
 return pts.map(p=>[pad+(p[0]-minx)*s,h-pad-(p[1]-miny)*s]);
}
function render(){
 var root=document.getElementById('root');root.innerHTML='';
 DATA.forEach(function(r){
  var c=document.createElement('div');c.className='card';
  var h='<div class=title>'+r.label+'</div>';
  h+='<div class=sum>\\ucd1d '+fmt(r.totalTime)+' \\u00b7 \\ud658\\uc2b9 '+r.transferCount+'\\ud68c \\u00b7 \\ub3c4\\ubcf4 '+fmt(r.totalWalkTime)+' \\u00b7 '+r.fare.toLocaleString()+'\\uc6d0</div>';
  h+='<div class=legs>';
  r.legs.forEach(function(l){
   if(l.mode==='WALK'){h+='<div>\\ud83d\\udeb6 \\ub3c4\\ubcf4 '+fmt(l.sectionTime)+'</div>';}
   else{h+='<div><span class=chip style="background:'+(COLOR[l.mode]||'#666')+'">'+l.mode+'</span>'+l.startName+' \\u2192 '+l.endName+' ('+fmt(l.sectionTime)+')</div>';}
  });
  h+='</div>';
  if(MODE==='B'){
   var all=[];r.legs.forEach(l=>{if(l.mode!=='WALK')l.points.forEach(p=>all.push(p))});
   if(all.length){
    var W=600,H=200,PAD=16;
    var svg='<svg viewBox="0 0 '+W+' '+H+'">';
    r.legs.forEach(function(l){
     if(l.mode==='WALK'||!l.points.length)return;
     var pr=projectShared(l.points,all,W,H,PAD);
     var d=pr.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
     svg+='<path d="'+d+'" fill=none stroke="'+(COLOR[l.mode]||'#666')+'" stroke-width=4 stroke-linejoin=round stroke-linecap=round/>';
    });
    var pr=projectShared(all,all,W,H,PAD);
    svg+='<circle cx='+pr[0][0].toFixed(1)+' cy='+pr[0][1].toFixed(1)+' r=5 fill=#111/>';
    svg+='<circle cx='+pr[pr.length-1][0].toFixed(1)+' cy='+pr[pr.length-1][1].toFixed(1)+' r=5 fill=#c0392b/>';
    svg+='</svg><div class=legend>\\u25cf \\ucd9c\\ubc1c(\\uc815\\ub958\\uc7a5 \\uae30\\uc900) \\u00b7 \\u25cf \\ub3c4\\ucc29 \\u00b7 \\uc120=\\ub300\\uc911\\uad50\\ud1b5 \\uad6c\\uac04(\\ub3c4\\ubcf4 \\uc81c\\uc678)</div>';
    h+=svg;
   }
  }
  c.innerHTML=h;root.appendChild(c);
 });
}
function setMode(m){MODE=m;document.getElementById('ba').className=m==='A'?'on':'';document.getElementById('bb').className=m==='B'?'on':'';render()}
render();
</script></html>"""


def main():
    data = []
    for tag, label in ROUTES:
        r = extract(tag)
        r["label"] = label
        data.append(r)
    html = (HTML.replace("__DATA__", json.dumps(data, ensure_ascii=False))
                .replace("__COLOR__", json.dumps(MODE_COLOR)))
    (BASE / "route-display.html").write_text(html)
    for r in data:
        n = sum(len(l["points"]) for l in r["legs"] if l["mode"] != "WALK")
        print(f"{r['label']}: {r['totalTime']//60}min transfer{r['transferCount']} "
              f"legs {len(r['legs'])} transit-pts {n}")
    print("\n생성: route-display.html (A/B 토글)")


if __name__ == "__main__":
    main()
