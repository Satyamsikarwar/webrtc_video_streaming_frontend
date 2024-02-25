import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChatService } from './chat.service';

interface Message {
  type: string;
  data: any;
}

// use these servers to get ice candidates which helps to find your ip address
const configuration = { iceServers: [{ urls: 'stun:stun1.l.google.com:19302' }] };

const mediaConstraints = {
  audio: true,
  video: { width: 500, height: 500 }
};

const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'vidoeStreaming';
  @ViewChild('local_video') localVideo!: ElementRef;
  @ViewChild('received_video') remoteVideo!: ElementRef;

  private peerConnection!: RTCPeerConnection;
  private localStream!: MediaStream;
  private remoteStream!: MediaStream;

  inCall = false;
  localVideoActive = false;

  constructor(private chatService: ChatService) {}

  ngAfterViewInit(): void {
    this.requestMediaDevices();
    this.onMessageHandler();
  }

  hangUp(): void {
    this.chatService.sendMessage({type: 'hangup', data: ''});
    this.closeVideoCall();
  }

  onMessageHandler() {
    this.chatService.connect();
    this.chatService.getMessageObservable().subscribe((msg: Message) => {
      if (msg.type) {
        if (msg.type === 'offer') {
          this.handleIncomingOffer(msg.data);
        } else if (msg.type === 'answer') {
          this.handleIncomingAnswer(msg.data);
        } else if (msg.type === 'ice_candidate') {
          this.handleIncomingIceCandidates(msg.data);
        }
        else if(msg.type === 'hangup'){
          this.handleHangupMessage(msg.data);
        }
      } else {
        console.log("error message:", msg);
      }
    }, (error: any) => {
      console.log('error in incoming message:', error);
    });
  }

  handleIncomingOffer(msg: RTCSessionDescriptionInit) {
    console.log('handle incoming offer');
    this.inCall=true;
    if (!this.peerConnection) {
      this.connectPeer();
    }

    if (!this.localStream) {
      this.startLocalVideo();
    }

    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg))
      .then(() => {
        this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));
      }).then(() => {
        return this.peerConnection.createAnswer();
      }).then((answer) => {
        return this.peerConnection.setLocalDescription(answer);
      }).then(() => {
        var response: Message = {
          type: 'answer',
          data: this.peerConnection.localDescription
        };
        this.chatService.sendMessage(response);
      }).catch((error) => {
        console.error('Error handling incoming offer:', error);
      });
  }

  handleIncomingAnswer(msg: RTCSessionDescriptionInit) {
    console.log('handle incoming answer');
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
    this.inCall=true;
  }

  handleIncomingIceCandidates(msg: RTCIceCandidate) {
    const candidate = new RTCIceCandidate(msg);
    this.peerConnection.addIceCandidate(candidate).catch((error) => {
      console.error('Error adding ICE candidate:', error);
    });
  }

  private handleHangupMessage(msg: Message): void {
    console.log(msg);
    this.inCall=false;
    this.closeVideoCall();
  }

  private closeVideoCall(): void {
    console.log('Closing call');

    if (this.peerConnection) {
      console.log('--> Closing the peer connection');

      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onsignalingstatechange = null;

      // Stop all transceivers on the connection
      this.peerConnection.getTransceivers().forEach(transceiver => {
        transceiver.stop();
      });

      // Close the peer connection
      this.peerConnection.close();
      this.peerConnection = null as unknown as RTCPeerConnection;
      this.inCall = false;
    }
  }


  async call() {
    console.log('call button called');
    try {
      this.connectPeer();
      this.localStream.getVideoTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      const offer: RTCSessionDescriptionInit = await this.createOffer();
      this.peerConnection.setLocalDescription(offer);
      const message: Message = {
        type: 'offer',
        data: offer
      };
      this.chatService.sendMessage(message);
    } catch (error) {
      console.error('Error calling:', error);
    }
  }

  private async requestMediaDevices(): Promise<void> {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        this.pauseLocalVideo();
      } else {
        console.error('getUserMedia is not supported');
      }
    } catch (e: any) {
      console.error(`getUserMedia() error: ${e.name}`);
    }
  }

  connectPeer(): void {
    try {
      this.peerConnection = new RTCPeerConnection(configuration);
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const message: Message = {
            type: 'ice_candidate',
            data: event.candidate
          };
          this.chatService.sendMessage(message);
        } else {
          console.error('No ICE candidate found');
        }
      };
      this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
      this.peerConnection.onsignalingstatechange= this.handleSignalingStateChangeEvent;
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams.length > 0) {
          this.remoteStream = event.streams[0];
          this.remoteVideo.nativeElement.srcObject = this.remoteStream;
        } else {
          console.error('No remote stream found');
        }
      };
    } catch (error) {
      console.error('Error creating RTCPeerConnection:', error);
    }
  }

  private handleICEConnectionStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  }
  private handleSignalingStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  }

  startLocalVideo(): void {
    console.log('starting local stream');
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = true;
    });
    this.localVideo.nativeElement.srcObject = this.localStream;
    this.localVideoActive = true;
  }

  pauseLocalVideo(): void {
    console.log('pause local stream');
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = false;
    });
    this.localVideo.nativeElement.srcObject = undefined;
    this.localVideoActive = false;
  }

  private async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
    return offer;
  }
}

