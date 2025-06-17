

function FaceID(){
    return(
        <div>
            <h2>Face ID Registration</h2>
            <p>Please position your face within the frame</p>
            <video id="video" width="300" height="300" autoPlay></video>
            <button id="capture">Capture</button>
        </div>
    )
}
export default FaceID;
