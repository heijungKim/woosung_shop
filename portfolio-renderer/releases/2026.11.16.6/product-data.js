const backgrounds=new Set(['white','black','page']);
const text=v=>typeof v==='string'?v:'';
export function normalizeProductPresentation(p={}){
 p=p&&typeof p==='object'&&!Array.isArray(p)?p:{};
 const raw=p.productBackgrounds??p.product_backgrounds??{};
 const entries=raw&&typeof raw==='object'&&!Array.isArray(raw)?Object.entries(raw):[];
 return {...p,productBackground:backgrounds.has(p.productBackground??p.product_background)?(p.productBackground??p.product_background):'white',productBackgrounds:Object.fromEntries(entries.filter(([id,v])=>id.length>0&&backgrounds.has(v)))};
}
export function normalizePortfolioProduct(p={}){
 const number=p.quantity==null||p.quantity===''?null:Number(p.quantity);
 let procurementUrl=null;try{const u=new URL(p.procurementUrl??p.procurement_url);if(u.protocol==='https:'&&(u.hostname==='g2b.go.kr'||u.hostname.endsWith('.g2b.go.kr')))procurementUrl=u.href;}catch{}
 return {...p,id:p.id,code:text(p.code),name:text(p.name),specification:text(p.specification),quantity:Number.isFinite(number)&&number>=0?number:null,thumbnail:text(p.thumbnail??p.thumbnail_url),procurementUrl};
}
export function sectionProducts(section,catalog=[]){
 const lookup=new Map(catalog.map(p=>[String(p.id),p]));
 const references=Array.isArray(section.products)?section.products:Array.isArray(section.product_ids)?section.product_ids:[];
 return references.map(p=>typeof p==='object'&&p!==null?p:lookup.get(String(p))).filter(Boolean).map(normalizePortfolioProduct);
}
export function productBackground(presentation,id){
 const p=normalizeProductPresentation(presentation);return p.productBackgrounds[String(id)]??p.productBackground;
}
