import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Paperclip, Mic, Send, LogIn, MessageSquarePlus, Users } from 'lucide-react';
import { io } from 'socket.io-client';

// --- Configuration ---
const API_URL = 'https://chatify-backend-jpl8.onrender.com';
const CHAT_ID = 'global_chatroom'; // All users will join this single chat room
const socket = io(API_URL, { autoConnect: false });

// --- Helper function to get user from localStorage ---
const getStoredUser = () => {
    try {
        const user = localStorage.getItem('chatify-user');
        return user ? JSON.parse(user) : null;
    } catch (error) {
        return null;
    }
};

// --- Main App Component (Acts as a router) ---
export default function App() {
    const [user, setUser] = useState(getStoredUser());

    const handleLogin = (username) => {
        const newUser = {
            id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: username,
            avatar: `https://placehold.co/100x100/3B82F6/FFFFFF?text=${username.charAt(0).toUpperCase()}`
        };
        localStorage.setItem('chatify-user', JSON.stringify(newUser));
        setUser(newUser);
    };

    useEffect(() => {
        if (user) {
            socket.auth = { user };
            socket.connect();
        }
        return () => {
            if (socket.connected) {
                socket.disconnect();
            }
        };
    }, [user]);

    if (!user) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return <ChatScreen currentUser={user} />;
}


// --- Login Screen Component ---
const LoginScreen = ({ onLogin }) => {
    const [username, setUsername] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (username.trim()) {
            onLogin(username.trim());
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-900">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg">
                <div className="text-center">
                    <MessageSquarePlus size={48} className="mx-auto text-blue-500" />
                    <h1 className="mt-4 text-3xl font-bold text-slate-800 dark:text-white">Welcome to Chatify</h1>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">Enter your name to join the chat</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Your Name"
                        className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                    <button type="submit" className="w-full flex justify-center items-center gap-2 px-4 py-2 font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800">
                        <LogIn size={18} />
                        Join Chat
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- Main Chat Application Component ---
const ChatScreen = ({ currentUser }) => {
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    // Join the global chat room
    socket.emit('joinRoom', CHAT_ID);

    // Fetch initial data
    const fetchInitialData = async () => {
        try {
            const [usersRes, messagesRes] = await Promise.all([
                fetch(`${API_URL}/api/users`),
                fetch(`${API_URL}/api/messages/${CHAT_ID}`),
            ]);
            const usersData = await usersRes.json();
            const messagesData = await messagesRes.json();
            setUsers(usersData);
            setMessages(messagesData);
        } catch (error) {
            console.error("Failed to fetch initial data:", error);
        }
    };
    fetchInitialData();

    // Listen for new users, messages, and typing indicators
    socket.on('user joined', (newUser) => setUsers(prev => ({...prev, [newUser.id]: newUser})));
    socket.on('user left', (userId) => setUsers(prev => {
        const newUsers = {...prev};
        delete newUsers[userId];
        return newUsers;
    }));
    socket.on('newMessage', (newMessage) => {
        // Only add the message if it's not from the current user
        if (newMessage.senderId !== currentUser.id) {
            setMessages(prev => [...prev, newMessage]);
        }
    });
    socket.on('typing', ({ user, isTyping }) => {
        // Don't show your own typing indicator
        if (user.id === currentUser.id) return;
        setTypingUsers(prev => isTyping ? [...prev, user] : prev.filter(u => u.id !== user.id));
    });
    socket.on('active users', (activeUsers) => setUsers(activeUsers));

    return () => {
        socket.off('user joined');
        socket.off('user left');
        socket.off('newMessage');
        socket.off('typing');
        socket.off('active users');
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const handleSendMessage = (content) => {
    if (!content.trim()) return;
    const newMessage = {
        id: `msg_${Date.now()}`,
        chatId: CHAT_ID,
        senderId: currentUser.id,
        content,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, newMessage]); // Optimistic update
    socket.emit('sendMessage', { chatId: CHAT_ID, message: newMessage });
  };

  return (
    <div className={`flex h-screen font-sans bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-300`}>
      <main className="flex-1 flex flex-col min-w-0">
        <ChatHeader onlineCount={Object.keys(users).length} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} />
        <ChatWindow messages={messages} users={users} currentUserId={currentUser.id} typingUsers={typingUsers} />
        <MessageInput onSendMessage={handleSendMessage} />
      </main>
    </div>
  );
}

// --- Components ---

const ChatHeader = ({ onlineCount, darkMode, toggleDarkMode }) => {
    return (
      <header className="flex-shrink-0 flex items-center p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <MessageSquarePlus className="text-blue-500" />
        <div className="ml-4">
          <p className="font-semibold">Global Chat</p>
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-green-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{onlineCount} users online</p>
          </div>
        </div>
        <div className="ml-auto">
            <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
        </div>
      </header>
    );
};

const ChatWindow = ({ messages, users, currentUserId, typingUsers }) => {
    const endOfMessagesRef = useRef(null);
  
    useEffect(() => {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typingUsers]);
  
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-200/50 dark:bg-slate-900/50">
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map(msg => (<MessageBubble key={msg.id} message={msg} sender={users[msg.senderId]} isSent={msg.senderId === currentUserId} />))}
          {typingUsers.map(user => (<TypingIndicator key={user.id} user={user} />))}
          <div ref={endOfMessagesRef} />
        </div>
      </div>
    );
};

const MessageBubble = ({ message, sender, isSent }) => {
    const user = sender || { name: 'User', avatar: 'https://placehold.co/100x100/CCCCCC/FFFFFF?text=?' };
  
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'justify-end' : ''} group`}>
        {!isSent && <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full self-start"/>}
        <div className={`max-w-md p-3 rounded-2xl ${isSent ? 'bg-blue-500 text-white rounded-br-md' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'}`}>
          {!isSent && <p className="text-xs font-semibold text-blue-500 mb-1">{user.name}</p>}
          <p className="text-sm">{message.content}</p>
          <div className={`text-xs mt-1 ${isSent ? 'text-blue-200 text-right' : 'text-slate-400 text-left'}`}>
            <span>{message.timestamp}</span>
          </div>
        </div>
      </div>
    );
};
  
const TypingIndicator = ({ user }) => {
    if (!user) return null;
    return (
        <div className="flex items-end gap-2">
            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full self-start"/>
            <div className="max-w-md p-3 rounded-2xl bg-white dark:bg-slate-800 rounded-bl-md">
                <div className="flex items-center space-x-1">
                    <span className="block w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="block w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="block w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
                </div>
            </div>
        </div>
    );
};

const MessageInput = ({ onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    if(typingTimeoutRef.current === null) {
        socket.emit('typing', { isTyping: true });
    } else { clearTimeout(typingTimeoutRef.current); }
    typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { isTyping: false });
        typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSendMessage(inputValue);
    setInputValue('');
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        socket.emit('typing', { isTyping: false });
        typingTimeoutRef.current = null;
    }
  };

  return (
    <footer className="flex-shrink-0 p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-2">
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><Paperclip size={22} className="text-slate-500" /></button>
        <input type="text" value={inputValue} onChange={handleTyping} placeholder="Type a message..." className="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><Mic size={22} className="text-slate-500" /></button>
        <button type="submit" className="bg-blue-500 text-white rounded-full p-3 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"><Send size={20} /></button>
      </form>
    </footer>
  );
};
