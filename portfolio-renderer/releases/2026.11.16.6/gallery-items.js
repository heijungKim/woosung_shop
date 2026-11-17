export function gallerySection(s){
 const images=s.images||[],byId=new Map(images.map(image=>[image.id,image]));
 const raw=s.comparisonPairs?.length?s.comparisonPairs:(s.comparisonId&&s.comparisonCompletedId?[{cg:s.comparisonId,completed:s.comparisonCompletedId}]:[]);
 const lookup={},labels={},hidden=new Set(),used=new Set();
 if(s.type==='completion')for(const pair of raw){if(pair.cg===pair.completed||!byId.has(pair.cg)||!byId.has(pair.completed)||used.has(pair.cg)||used.has(pair.completed))continue;lookup[pair.completed]=byId.get(pair.cg);labels[pair.completed]=pair.side_titles||[byId.get(pair.cg).comparison_label||'CG',byId.get(pair.completed).comparison_label||'준공'];hidden.add(pair.cg);used.add(pair.cg);used.add(pair.completed);}
 return {...s,images:images.filter(image=>!hidden.has(image.id)),comparisonLookup:lookup,comparisonLabels:labels,comparisonImage:s.comparisonId?byId.get(s.comparisonId):null};
}
export function activeGalleryIndex(s,id){
 const images=s.images||[];let index=id?images.findIndex(image=>image.id===id||s.comparisonLookup?.[image.id]?.id===id):-1;
 if(index<0){const initial=s.presentation?.initialImageId||s.presentation?.initial_image_id;if(initial)index=images.findIndex(image=>image.id===initial||s.comparisonLookup?.[image.id]?.id===initial);}
 return Math.max(0,index);
}
