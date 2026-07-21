#!/usr/bin/env python3
"""Outbound Link Builder (문서 5.6 / 7장 / 12장 5단계).

내부의 WGS84 좌표 + 장소명만으로 카카오맵·네이버 지도의
'장소 보기' / '대중교통 길찾기' / '주변 검색' 링크를 생성한다.
공급자 출처와 무관하게 좌표·이름으로 만들므로 카카오 링크로 가져온 장소도
네이버 지도에서 열 수 있다(문서 5.6 마지막 문단).

- 카카오: 키 불필요. 공식 Web URL + 앱 Scheme.
- 네이버: 키 불필요. 앱 Scheme(appname 필수) + 웹 링크(PC/앱 미설치용, 문서 5.6·13장 요구).

부수 효과: results.json 을 읽어 test-outbound.html(팀이 폰/PC에서 클릭 테스트)과
outbound_test.json(생성된 링크 기록)을 만든다. 실행: python3 outbound_links.py
"""

import json
import urllib.parse
from pathlib import Path

BASE = Path(__file__).resolve().parent

# 네이버 지도 URL Scheme 의 서비스 식별값(문서: PUBLIC_APP_NAME). API 키 아님.
APP_NAME = "com.teamd.meeting"

# 기본 출발지(길찾기 테스트용) — 강남역
DEFAULT_START = {"name": "강남역", "lat": 37.497942, "lon": 127.027619}


def kakao_links(name, lat, lon, start=None):
    """카카오맵 Web URL(모든 환경) + 앱 Scheme(모바일)."""
    q = urllib.parse.quote
    web_view = f"https://map.kakao.com/link/map/{q(name)},{lat},{lon}"
    web_route = f"https://map.kakao.com/link/to/{q(name)},{lat},{lon}"
    web_search = f"https://map.kakao.com/link/search/{q(name)}"
    app_view = f"kakaomap://look?p={lat},{lon}"
    app_route = f"kakaomap://route?ep={lat},{lon}&by=PUBLICTRANSIT"
    if start:
        app_route += f"&sp={start['lat']},{start['lon']}"
    return {"web_view": web_view, "web_route": web_route, "web_search": web_search,
            "app_view": app_view, "app_route": app_route}


def naver_links(name, lat, lon, start=None):
    """네이버 지도 앱 Scheme(appname 필수) + 웹 링크(PC/앱 미설치용)."""
    q = urllib.parse.quote
    app_view = (f"nmap://place?lat={lat}&lng={lon}&name={q(name)}&appname={APP_NAME}")
    route = (f"nmap://route/public?dlat={lat}&dlng={lon}&dname={q(name)}")
    if start:
        route += f"&slat={start['lat']}&slng={start['lon']}&sname={q(start['name'])}"
    app_route = route + f"&appname={APP_NAME}"
    # nmap:// 은 PC 에서 동작하지 않으므로 웹 링크 병행(문서 5.6·13장)
    web_view = f"https://map.naver.com/p/search/{q(name)}"
    web_route = f"https://map.naver.com/p/directions/-/-/-/transit?c=&destination={q(name)}"
    return {"app_view": app_view, "app_route": app_route,
            "web_view": web_view, "web_route": web_route}


def build_all(name, lat, lon, start=None):
    return {"KAKAO": kakao_links(name, lat, lon, start),
            "NAVER": naver_links(name, lat, lon, start)}


HTML_HEAD = """<!doctype html><html lang=ko><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Outbound 앱 Scheme 테스트</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:14px 14px 90px;background:#f5f5f5;color:#222}
h1{font-size:17px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:10px;line-height:1.5}
.dev{background:#222;color:#fff;font-size:12px;padding:8px 10px;border-radius:8px;margin-bottom:12px}
.card{background:#fff;border-radius:10px;padding:12px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.name{font-weight:600;font-size:14px}.addr{color:#777;font-size:11px;margin:2px 0 8px}
.row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0;padding-top:6px;border-top:1px solid #f0f0f0}
.lbl{font-size:12px;width:78px;color:#555}
.act{flex:1;min-width:120px;padding:9px;border-radius:7px;border:1px solid #ccc;font-size:12px;
  text-align:center;text-decoration:none;color:#222;cursor:pointer}
.kakao{border-color:#f7d000;background:#fff8d6}.naver{border-color:#03c75a;background:#e4f9ee}
.tag{font-size:11px;padding:6px 8px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer}
.st{font-size:11px;padding:2px 6px;border-radius:4px;margin-left:4px}
.st.APP_OPENED{background:#d6f5df;color:#177a37}.st.WEB_FALLBACK{background:#fff2cc;color:#8a6d00}
.st.FAILED{background:#ffdada;color:#b00}
.bar{position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;padding:8px 12px;display:flex;gap:8px;align-items:center}
.bar button{padding:8px 12px;border:0;border-radius:6px;font-size:12px;cursor:pointer}
#cnt{font-size:12px;flex:1}
textarea{width:100%;height:120px;font-size:11px;font-family:monospace}
</style>
<h1>외부 지도 Outbound 앱 Scheme 테스트</h1>
<div class=sub>출발지 강남역. <b>앱으로 열기</b>를 누르면 앱 설치 시 앱이 열리고, 미설치면 1.6초 후 웹으로 자동 전환됩니다.
자동 판정이 틀리면 아래 앱됨/웹됨/실패 태그로 수정하세요. 마지막에 <b>결과 복사</b>로 JSON을 보내주세요.</div>
<div class=dev id=dev></div>
<div id=root></div>
<div class=bar><span id=cnt>기록 0건</span>
<button onclick="showJson()" style="background:#4a90e2;color:#fff">결과 보기/복사</button></div>
<dialog id=dlg style="width:90%;max-width:560px"><textarea id=out readonly></textarea>
<div style="margin-top:8px;display:flex;gap:8px"><button onclick="copyOut()">복사</button>
<button onclick="document.getElementById('dlg').close()">닫기</button></div></dialog>
<script>
var DATA=__DATA__, RESULTS=[];
function device(){
 var u=navigator.userAgent, os='기타', br='';
 if(/iPhone|iPad/.test(u))os='iOS'; else if(/Android/.test(u))os='Android';
 else if(/Macintosh/.test(u))os='macOS'; else if(/Windows/.test(u))os='Windows';
 if(/CriOS|Chrome/.test(u))br='Chrome'; else if(/Safari/.test(u))br='Safari';
 return os+' '+br;
}
var DEV=device();
document.getElementById('dev').textContent='감지된 환경: '+DEV+'  (모바일 실기기에서 테스트하세요)';
function record(id,prov,action,result,ms){
 RESULTS.push({caseId:id,outProvider:prov,action:action,device:DEV,
   outboundOpenResult:result,elapsedMs:ms,notes:''});
 document.getElementById('cnt').textContent='기록 '+RESULTS.length+'건';
 var el=document.getElementById('st_'+id+'_'+prov+'_'+action);
 if(el){el.textContent=result;el.className='st '+result;}
}
function launchApp(scheme,webUrl,id,prov,action){
 var t0=Date.now(), hidden=false;
 function onHide(){hidden=true;}
 document.addEventListener('visibilitychange',function(){if(document.hidden)hidden=true;});
 window.addEventListener('pagehide',onHide);window.addEventListener('blur',onHide);
 var timer=setTimeout(function(){
  if(hidden){record(id,prov,action,'APP_OPENED',Date.now()-t0);}
  else{record(id,prov,action,'WEB_FALLBACK',Date.now()-t0);if(webUrl)location.href=webUrl;}
 },1600);
 try{location.href=scheme;}catch(e){clearTimeout(timer);record(id,prov,action,'FAILED',0);}
}
function tag(id,prov,action,result){record(id,prov,action,result,0);}
function showJson(){document.getElementById('out').value=JSON.stringify(RESULTS,null,2);
 document.getElementById('dlg').showModal();}
function copyOut(){var t=document.getElementById('out');t.select();
 navigator.clipboard&&navigator.clipboard.writeText(t.value);}
var root=document.getElementById('root');
function mkRow(p,prov,action,scheme,webUrl,label){
 var id=p.caseId, div=document.createElement('div');div.className='row';
 div.innerHTML='<span class=lbl>'+label+'</span>';
 var a=document.createElement('a');a.className='act '+prov.toLowerCase();a.textContent='앱으로 열기';
 a.onclick=function(){launchApp(scheme,webUrl,id,prov,action);};div.appendChild(a);
 if(webUrl){var w=document.createElement('a');w.className='act '+prov.toLowerCase();
  w.textContent='웹 직접';w.href=webUrl;w.target='_blank';div.appendChild(w);}
 ['APP_OPENED','WEB_FALLBACK','FAILED'].forEach(function(r){
  var b=document.createElement('span');b.className='tag';b.textContent={APP_OPENED:'앱됨',WEB_FALLBACK:'웹됨',FAILED:'실패'}[r];
  b.onclick=function(){tag(id,prov,action,r);};div.appendChild(b);});
 var st=document.createElement('span');st.className='st';st.id='st_'+id+'_'+prov+'_'+action;div.appendChild(st);
 return div;
}
DATA.forEach(function(p){
 var c=document.createElement('div');c.className='card';
 c.innerHTML='<div class=name>'+p.name+'</div><div class=addr>'+(p.address||'')+' · '+p.lat.toFixed(5)+','+p.lon.toFixed(5)+' (출처 '+p.source+')</div>';
 c.appendChild(mkRow(p,'KAKAO','view',p.links.KAKAO.app_view,p.links.KAKAO.web_view,'카카오 보기'));
 c.appendChild(mkRow(p,'KAKAO','route',p.links.KAKAO.app_route,p.links.KAKAO.web_route,'카카오 길찾기'));
 c.appendChild(mkRow(p,'NAVER','view',p.links.NAVER.app_view,p.links.NAVER.web_view,'네이버 보기'));
 c.appendChild(mkRow(p,'NAVER','route',p.links.NAVER.app_route,p.links.NAVER.web_route,'네이버 길찾기'));
 root.appendChild(c);
});
</script></html>"""


def main():
    src = json.loads((BASE / "results.json").read_text())
    places = [c for c in src["cases"] if c.get("lat")]
    data, records = [], []
    for c in places:
        links = build_all(c["name"], c["lat"], c["lon"], DEFAULT_START)
        data.append({"caseId": c["caseId"], "name": c["name"], "address": c.get("address", ""),
                     "lat": c["lat"], "lon": c["lon"], "source": c["provider"], "links": links})
        for prov, actions in links.items():
            for action, url in actions.items():
                records.append({"caseId": c["caseId"], "sourceProvider": c["provider"],
                                "outProvider": prov, "action": action, "url": url})
    (BASE / "outbound_test.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2))
    html = HTML_HEAD.replace("__DATA__", json.dumps(data, ensure_ascii=False))
    (BASE / "test-outbound.html").write_text(html)
    print(f"장소 {len(places)}개 × 링크 {len(records)}개 생성")
    print("샘플:")
    for r in records[:4]:
        print(f"  [{r['outProvider']} {r['action']}] {r['url']}")
    print(f"\n생성: test-outbound.html (폰/PC 브라우저로 열기), outbound_test.json")


if __name__ == "__main__":
    main()
