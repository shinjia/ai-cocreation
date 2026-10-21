<?php
/** Shared fixture inputs only. No application behavior is mocked here. */
function fixtureBoundNew($app,$metadata=array()) {
    $status=$app->status();
    return array_merge(array('action'=>'new','memberId'=>$status['memberId'],
        'expectedSettingsRevision'=>$status['settingsRevision']),$metadata);
}
function fixtureProjectInput($app,$project,$action,$extra=array()) {
    $status=$app->status();$binding=field($project,'aiBinding');
    return array_merge(array('action'=>$action,'id'=>$project['id'],'itemId'=>$project['activeItemId'],
        'revision'=>$project['revision'],'consent'=>true,'approvedMemberId'=>field($binding,'memberId'),
        'approvedProvider'=>field($binding,'provider'),'approvedModel'=>field($binding,'model'),
        'approvedSettingsRevision'=>$status['settingsRevision'],'approvedKeyRevision'=>$status['keyRevision'],
        'requestId'=>newId()),$extra);
}
function fixtureEmptyDirection() {
    return array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());
}
function fixtureExploringResponse($response,$properties) {
    if(isset($properties['directionStatus'])) {
        $response['directionStatus']='exploring';$response['direction']=fixtureEmptyDirection();
    }
    return $response;
}
