import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';


interface Message{
  type: string,
  data: string
}

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private socket!: WebSocket;
  private messageSubject: Subject<Message> = new Subject<Message>();
  private socketSubscription: Subscription | undefined;

  constructor() { }

  connect() {
    this.socket = new WebSocket('ws://localhost:8000/ws'); // Replace with your WebSocket server URL
    this.socket.onopen = () => {
      console.log('Connected to server');
    };
    this.socket.onmessage = (msg:any) => {
      console.log('Received message:', msg.data);
      const message: Message = JSON.parse(msg.data);
      this.messageSubject.next(message);
    };
    this.socket.onclose = () => {
      console.log('Connection closed');
    };
    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    this.socketSubscription = this.messageSubject.subscribe({
      error: (err) => {
        console.error('Message Subject error:', err);
      }
    });
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
    if (this.socketSubscription) {
      this.socketSubscription.unsubscribe();
    }
  }

  sendMessage(message: Message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not open');
    }
  }
  
  getMessageObservable() {
    return this.messageSubject.asObservable();
  }

  ngOnDestroy() {
    this.disconnect();
  }
}
