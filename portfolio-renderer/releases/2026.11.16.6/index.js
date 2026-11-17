import{normalizeProductPresentation,sectionProducts}from'./product-data.js';
import {renderPortfolio as render} from './engine.js';
export const rendererVersion='2026.11.16.6';
const text=v=>String(v??'');
function resolvedInterval(s){const p=s.presentation||{},v=p.intervalMs??p.interval_ms,old=s.type==='process'?2000:6000;return p.interval_custom===true?(v??4000):(v==null||!p.interval_default_version&&v===old?4000:v);}
/** Accept existing website camelCase or Manager schema v1 without rewriting saved data. */
export function normalizeContent(content,assets=[],products=[]){
 if(Number(content?.schemaVersion??content?.schema_version)!==1)throw Error('지원하지 않는 포트폴리오 데이터 형식입니다.');
 const media=new Map(assets.map(a=>[a.id,a])),catalog=new Map(products.map(p=>[p.id,p]));
 return {...content,schemaVersion:1,title:text(content.title),sections:(content.sections||[]).map(s=>({...s,
  images:(s.images||[]).map(i=>{const a=media.get(i.asset_id??i.assetId);return {...i,assetId:i.assetId??i.asset_id,src:i.src||a?.url||'',alt:text(i.label||'프로젝트 이미지'),position:{x:50,y:50,zoom:1,fit:'contain',...i.position}};}),
  comparisonPairs:s.comparison_pairs??(s.comparison_id?[{cg:s.comparison_id,completed:s.comparison_completed_id||s.images?.find(i=>i.role==='completed'&&i.id!==s.comparison_id)?.id||s.images?.find(i=>i.id!==s.comparison_id)?.id}]:[]),
  comparisonId:s.comparisonId??s.comparison_id,
  comparisonCompletedId:s.comparisonCompletedId??s.comparison_completed_id??s.images?.find(i=>i.role==='completed'&&i.id!==(s.comparisonId??s.comparison_id))?.id??s.images?.find(i=>i.id!==(s.comparisonId??s.comparison_id))?.id,
  presentation:{layout:'gallery',autoplay:false,...normalizeProductPresentation(s.presentation),intervalMs:resolvedInterval(s)},
  keywords:s.keywords||[],colors:s.colors||[],products:sectionProducts(s,products)
 }))};
}
export async function renderPortfolio(host,options={}){
 const mode=options.mode??(options.editing?'edit':'publish');
 if(!['publish','preview','edit'].includes(mode))throw Error('지원하지 않는 실행 모드입니다.');
 const record=options.record||{name:options.content?.title,content:options.content};
 const content=normalizeContent(record.content,options.assets,options.products);
 if(!content.sections.some(s=>s.visible!==false))throw Error('표시할 섹션이 없습니다.');
 const cssURL=new URL('./renderer.css',import.meta.url).href;
 if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(n=>n.href===cssURL)){
  const link=document.createElement('link');link.rel='stylesheet';link.href=cssURL;
  await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error('상세 양식 스타일을 불러오지 못했습니다.'));document.head.append(link);});
 }
 const view=await render(host,{...options,record:{...record,name:record.name||content.title,content},mode});
 host.dataset.rendererVersion=rendererVersion;
 if(mode==='edit'){
  const changed=e=>{const image=e.target.closest('[data-ref-id]');if(image)options.onSelect?.({imageId:image.dataset.refId,sectionId:image.closest('[data-section]')?.dataset.section});};
  host.addEventListener('click',changed);
  const dispose=view.dispose;view.dispose=()=>{host.removeEventListener('click',changed);dispose();};
 }
 return {...view,version:rendererVersion};
}
