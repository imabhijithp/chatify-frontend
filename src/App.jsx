import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Paperclip, Mic, Send, LogIn, MessageSquarePlus, Users } from 'lucide-react';
import { io } from 'socket.io-client';

// --- Configuration ---
const API_URL = 'https://chatify-backend-jpl8.onrender.com';
const CHAT_ID = 'global_chatroom';
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
    const [showLogin, setShowLogin] = useState(!getStoredUser());

    const handleLogin = (username) => {
        const newUser = {
            id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            name: username,
            avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${username}`
        };
        localStorage.setItem('chatify-user', JSON.stringify(newUser));
        setUser(newUser);
        setShowLogin(false);
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

    return (
        <>
            {showLogin && <LoginModal onLogin={handleLogin} />}
            <ChatScreen currentUser={user} isBlurred={showLogin} />
        </>
    );
}

// --- Login Modal Component ---
const LoginModal = ({ onLogin }) => {
    const [username, setUsername] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (username.trim()) {
            onLogin(username.trim());
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm transition-opacity duration-300">
            <div className="w-full max-w-sm p-8 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale">
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
                        className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                    <button type="submit" className="w-full flex justify-center items-center gap-2 px-4 py-3 font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors">
                        <LogIn size={18} />
                        Join Chat
                    </button>
                </form>
            </div>
            <style>{`
                @keyframes fade-in-scale {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in-scale {
                    animation: fade-in-scale 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1);
                }
            `}</style>
        </div>
    );
};

// --- Main Chat Application Component ---
const ChatScreen = ({ currentUser, isBlurred }) => {
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    if (!currentUser) return;

    socket.emit('joinRoom', CHAT_ID);

    const fetchInitialData = async () => {
        try {
            const messagesRes = await fetch(`${API_URL}/api/messages/${CHAT_ID}`);
            const messagesData = await messagesRes.json();
            setMessages(messagesData);
        } catch (error) { console.error("Failed to fetch initial messages:", error); }
    };
    fetchInitialData();

    socket.on('user joined', (newUser) => setUsers(prev => ({...prev, [newUser.id]: newUser})));
    socket.on('user left', (userId) => setUsers(prev => {
        const newUsers = {...prev};
        delete newUsers[userId];
        return newUsers;
    }));
    socket.on('newMessage', (newMessage) => {
        if (newMessage.sender.id !== currentUser.id) {
            setMessages(prev => [...prev, newMessage]);
        }
    });
    socket.on('typing', ({ user, isTyping }) => {
        if (user.id === currentUser.id) return;
        setTypingUsers(prev => isTyping ? [...prev.filter(u => u.id !== user.id), user] : prev.filter(u => u.id !== user.id));
    });
    socket.on('active users', (activeUsers) => setUsers(activeUsers));

    return () => {
        socket.off('user joined');
        socket.off('user left');
        socket.off('newMessage');
        socket.off('typing');
        socket.off('active users');
    };
  }, [currentUser]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const handleSendMessage = (content) => {
    if (!content.trim() || !currentUser) return;
    const newMessage = {
        id: `msg_${Date.now()}`,
        chatId: CHAT_ID,
        content,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        sender: {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar
        }
    };
    setMessages(prev => [...prev, newMessage]);
    socket.emit('sendMessage', { chatId: CHAT_ID, message: newMessage });
  };

  return (
    <div className={`flex h-screen font-sans bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-all duration-300 ${isBlurred ? 'filter blur-md' : ''}`}>
      <main className="flex-1 flex flex-col min-w-0">
        <ChatHeader onlineCount={Object.keys(users).length} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} />
        <ChatWindow messages={messages} currentUserId={currentUser?.id} typingUsers={typingUsers} />
        <MessageInput onSendMessage={handleSendMessage} />
      </main>
    </div>
  );
}

// --- Components ---

const ChatHeader = ({ onlineCount, darkMode, toggleDarkMode }) => {
    return (
      <header className="flex-shrink-0 flex items-center p-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <MessageSquarePlus className="text-blue-500" />
        <div className="ml-4">
          <p className="font-semibold text-base">Global Chat</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{onlineCount} users online</p>
          </div>
        </div>
        <div className="ml-auto">
            <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
        </div>
      </header>
    );
};

const ChatWindow = ({ messages, currentUserId, typingUsers }) => {
    const endOfMessagesRef = useRef(null);
  
    useEffect(() => {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typingUsers]);
  
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-200/50 dark:bg-slate-900/50" style={{backgroundImage: `url("data:image/svg+xml,%3Csvg width='52' height='26' viewBox='0 0 52 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.1'%3E%3Cpath d='M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`}}>
        <div className="max-w-4xl mx-auto space-y-2">
          {messages.map(msg => (<MessageBubble key={msg.id} message={msg} isSent={msg.sender.id === currentUserId} />))}
          {typingUsers.map(user => (<TypingIndicator key={user.id} user={user} />))}
          <div ref={endOfMessagesRef} />
        </div>
      </div>
    );
};

const MessageBubble = ({ message, isSent }) => {
    const sender = message.sender;
    if (!sender) return null;
  
    return (
      <div className={`flex items-end gap-3 ${isSent ? 'justify-end' : ''} group animate-fade-in`}>
        {!isSent && <img src={sender.avatar} alt={sender.name} className="w-8 h-8 rounded-full self-start shadow-sm"/>}
        <div className={`max-w-lg p-3 rounded-2xl shadow-md ${isSent ? 'bg-blue-500 text-white rounded-br-lg' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-lg'}`}>
          {!isSent && <p className="text-xs font-semibold text-blue-500 mb-1">{sender.name}</p>}
          <p className="text-sm leading-relaxed">{message.content}</p>
          <div className={`text-xs mt-1.5 ${isSent ? 'text-blue-200 text-right' : 'text-slate-400 text-left'}`}>
            <span>{message.timestamp}</span>
          </div>
        </div>
        <style>{`
            @keyframes fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in {
                animation: fade-in 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1);
            }
        `}</style>
      </div>
    );
};
  
const TypingIndicator = ({ user }) => {
    if (!user) return null;
    return (
        <div className="flex items-end gap-3">
            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full self-start"/>
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 rounded-bl-lg shadow-md">
                <div className="flex items-center space-x-1.5">
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
    <footer className="flex-shrink-0 p-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-3">
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Paperclip size={22} className="text-slate-500" /></button>
        <input type="text" value={inputValue} onChange={handleTyping} placeholder="Type a message..." className="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Mic size={22} className="text-slate-500" /></button>
        <button type="submit" className="bg-blue-500 text-white rounded-full p-3.5 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 transition-colors shadow-lg">
            <Send size={20} />
        </button>
      </form>
    </footer>
  );
};
