<?php
// Add a module descriptor and an adapter for future capabilities; only titles is active.
function moduleRegistry() {
    return array(
        array('id'=>'titles','label'=>'標題名稱','enabled'=>true),
        array('id'=>'article','label'=>'文章','enabled'=>false),
        array('id'=>'poster','label'=>'海報設計','enabled'=>false),
        array('id'=>'webpage','label'=>'網頁設計','enabled'=>false),
        array('id'=>'interactive','label'=>'互動程式創意','enabled'=>false)
    );
}
function moduleAdapter($id,$model) {
    ensure($id==='titles','MODULE_UNAVAILABLE','此模組尚未開放；目前只提供標題創意。',409);
    return new TitleModule($model);
}
