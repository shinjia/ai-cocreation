<?php
// Keep all twelve established ids. Each adapter exposes only its implemented
// capabilities; enabled does not imply arbitrary code execution or pixel generation.
function moduleRegistry() {
    return array(
        array('id'=>'titles','label'=>'標題名稱','enabled'=>true),
        array('id'=>'short_text','label'=>'短文','enabled'=>true),
        array('id'=>'article','label'=>'長篇文章','enabled'=>true),
        array('id'=>'illustrated','label'=>'圖文','enabled'=>true),
        array('id'=>'table','label'=>'表格','enabled'=>true),
        array('id'=>'chart','label'=>'圖表','enabled'=>true),
        array('id'=>'mindmap','label'=>'心智圖','enabled'=>true),
        array('id'=>'vector','label'=>'向量圖形','enabled'=>true),
        array('id'=>'image','label'=>'圖片創作','enabled'=>true),
        array('id'=>'poster','label'=>'海報設計','enabled'=>true),
        array('id'=>'webpage','label'=>'網頁','enabled'=>true),
        array('id'=>'interactive','label'=>'互動視覺程式','enabled'=>true)
    );
}
function moduleAdapter($id,$model) {
    if($id==='titles')return new TitleModule($model);
    if($id==='short_text'||$id==='article')return new TextModule($model,$id);
    if($id==='mindmap')return new MindmapModule($model);
    if($id==='vector')return new VectorModule($model);
    if($id==='illustrated'||$id==='poster')return new CompositionModule($model,$id);
    if($id==='interactive')return new InteractiveModule($model);
    if($id==='image')return new ImageModule($model);
    if($id==='webpage')return new WebpageModule($model);
    if(artifactType($id))return new ArtifactModule($model,$id);
    throw new AppError('MODULE_UNAVAILABLE','此模組仍在規劃中，尚未開放；目前提供標題名稱、短文、長篇文章、表格、圖表、心智圖、向量圖形、網頁、圖片上傳／分析、圖文／海報原生排版與受限互動視覺程式。',409);
}
