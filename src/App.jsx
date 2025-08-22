import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Search, Paperclip, Mic, Send, Check, CheckCheck, UserPlus, MessageSquarePlus } from 'lucide-react';
import { io } from 'socket.io-client';

// --- Configuration ---
// This now points to YOUR live backend on Render
const API_URL = 'https://chatify-backend-jpl8.onrender.com';
const socket = io(API_URL);

// --- Main App Component ---
export default function App() {
  const [activeChatId, setActiveChatId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState({}); // Store messages by chatId { chatId: [messages] }
  const [users, setUsers] = useState({});
  const [typingChats, setTypingChats] = useState(new Set());

  // --- Initial Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, chatsRes] = await Promise.all([
          fetch(`${API_URL}/api/users`),
          fetch(`${API_URL}/api/chats`),
        ]);
        const usersData = await usersRes.json();
        const chatsData = await chatsRes.json();
        setUsers(usersData);
        setChats(chatsData);
        // Automatically select the first chat as active
        if (chatsData.length > 0 && !activeChatId) {
            setActiveChatId(chatsData[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    };
    fetchData();
  }, []);

  // --- Socket.IO Event Listeners ---
  useEffect(() => {
    socket.on('connect', () => {
        console.log('Connected to WebSocket server with ID:', socket.id);
    });

    socket.on('newMessage', (newMessage) => {
        setMessages(prevMessages => ({
            ...prevMessages,
            [newMessage.chatId]: [...(prevMessages[newMessage.chatId] || []), newMessage]
        }));
    });

    socket.on('typing', ({ chatId, isTyping }) => {
        setTypingChats(prev => {
            const newTypingChats = new Set(prev);
            if (isTyping) {
                newTypingChats.add(chatId);
            } else {
                newTypingChats.delete(chatId);
            }
            return newTypingChats;
        });
    });

    // Cleanup listeners on component unmount
    return () => {
        socket.off('connect');
        socket.off('newMessage');
        socket.off('typing');
    };
  }, []);

  // --- Fetch Messages for Active Chat ---
  useEffect(() => {
    if (!activeChatId) return;

    // Join the socket room for this chat
    socket.emit('joinRoom', activeChatId);

    const fetchMessages = async () => {
        if (!messages[activeChatId]) { // Only fetch if we don't have messages
            try {
                const res = await fetch(`${API_URL}/api/messages/${activeChatId}`);
                const data = await res.json();
                setMessages(prev => ({ ...prev, [activeChatId]: data }));
            } catch (error) {
                console.error(`Failed to fetch messages for chat ${activeChatId}:`, error);
            }
        }
    };
    fetchMessages();
  }, [activeChatId]);

  // --- Dark Mode ---
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const handleSendMessage = (content) => {
    if (!content.trim()) return;
    const newMessage = {
        id: `msg_${Date.now()}`,
        chatId: activeChatId,
        senderId: 'user1', // In a real app, this would be the logged-in user's ID
        content,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'sent'
    };
    // Add message to local state immediately for a responsive feel
    setMessages(prev => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), newMessage]
    }));
    // Send message to the server
    socket.emit('sendMessage', { chatId: activeChatId, message: newMessage });
  };

  const activeChat = chats.find(c => c.id === activeChatId);
  const otherUser = activeChat ? users[activeChat.members.find(m => m !== 'user1')] : null;

  return (
    <div className={`flex h-screen font-sans bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-300`}>
      <Sidebar chats={chats} users={users} activeChatId={activeChatId} setActiveChatId={setActiveChatId} typingChats={typingChats} />
      <main className="flex-1 flex flex-col min-w-0">
        {activeChat && otherUser ? (
          <>
            <ChatHeader user={otherUser} darkMode={darkMode} toggleDarkMode={() => setDarkMode(!darkMode)} />
            <ChatWindow 
                messages={messages[activeChatId] || []} 
                users={users} 
                typing={typingChats.has(activeChatId)} 
            />
            <MessageInput onSendMessage={handleSendMessage} chatId={activeChatId} />
          </>
        ) : (
           <WelcomeScreen />
        )}
      </main>
    </div>
  );
}

// --- Components ---

const MessageInput = ({ onSendMessage, chatId }) => {
  const [inputValue, setInputValue] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    
    // Emit 'typing: start'
    if(typingTimeoutRef.current === null) {
        socket.emit('typing', { chatId, isTyping: true });
    } else {
        clearTimeout(typingTimeoutRef.current);
    }

    // Emit 'typing: stop' after a delay
    typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing', { chatId, isTyping: false });
        typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSendMessage(inputValue);
    setInputValue('');
    // Stop typing indicator on send
    if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        socket.emit('typing', { chatId, isTyping: false });
        typingTimeoutRef.current = null;
    }
  };

  return (
    <footer className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center gap-2">
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <Paperclip size={22} className="text-slate-500" />
        </button>
        <input
          type="text"
          value={inputValue}
          onChange={handleTyping}
          placeholder="Type a message..."
          className="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <Mic size={22} className="text-slate-500" />
        </button>
        <button type="submit" className="bg-blue-500 text-white rounded-full p-3 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">
          <Send size={20} />
        </button>
      </form>
    </footer>
  );
};

const Sidebar = ({ chats, users, activeChatId, setActiveChatId, typingChats }) => {
    return (
      <aside className="w-full sm:w-80 md:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-950">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-950 z-10">
          <h2 className="text-xl font-bold text-blue-500">Chats</h2>
          <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <MessageSquarePlus size={20} />
          </button>
        </div>
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search chats..."
              className="w-full bg-slate-100 dark:bg-slate-800 border border-transparent rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => {
            const otherUserId = chat.members.find(m => m !== 'user1');
            const user = users[otherUserId];
            if (!user) return null;
            return (
              <ChatItem
                key={chat.id}
                chat={{...chat, typing: typingChats.has(chat.id)}}
                user={user}
                isActive={chat.id === activeChatId}
                onClick={() => setActiveChatId(chat.id)}
              />
            );
          })}
        </div>
         <div className="absolute bottom-6 right-[-2rem] sm:right-6">
          <button className="bg-blue-500 text-white rounded-full p-4 shadow-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950">
              <UserPlus size={24} />
          </button>
        </div>
      </aside>
    );
};
  
const ChatItem = ({ chat, user, isActive, onClick }) => {
    return (
      <div
        onClick={onClick}
        className={`flex items-center p-3 m-2 rounded-lg cursor-pointer transition-colors ${
          isActive ? 'bg-blue-500 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <div className="relative">
          <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full" />
          {chat.online && <span className="absolute bottom-0 right-0 block h-3 w-3 bg-green-500 border-2 border-white dark:border-slate-950 rounded-full"></span>}
        </div>
        <div className="flex-1 ml-4 min-w-0">
          <p className={`font-semibold truncate ${isActive ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>{user.name}</p>
          {chat.typing ? (
              <p className={`text-sm truncate ${isActive ? 'text-blue-200' : 'text-blue-500'}`}>typing...</p>
          ) : (
              <p className={`text-sm truncate ${isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>{chat.lastMessage}</p>
          )}
        </div>
        <div className="flex flex-col items-end text-xs">
          <span className={`${isActive ? 'text-blue-200' : 'text-slate-400'}`}>{chat.timestamp}</span>
          {chat.unread > 0 && (
            <span className="mt-1 bg-green-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {chat.unread}
            </span>
          )}
        </div>
      </div>
    );
};
  
const ChatHeader = ({ user, darkMode, toggleDarkMode }) => {
    return (
      <header className="flex items-center p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-10">
        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
        <div className="ml-4">
          <p className="font-semibold">{user.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Online</p>
        </div>
        <div className="ml-auto">
          <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>
    );
};
  
const ChatWindow = ({ messages, users, typing }) => {
    const endOfMessagesRef = useRef(null);
  
    useEffect(() => {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typing]);
  
    const otherUser = Object.values(users).find(u => u && u.name !== 'You');
  
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-slate-200/50 dark:bg-slate-900/50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} users={users} />
          ))}
          {typing && <TypingIndicator user={otherUser} />}
          <div ref={endOfMessagesRef} />
        </div>
      </div>
    );
};
  
const MessageBubble = ({ message, users }) => {
    const isSent = message.senderId === 'user1';
    const sender = users[message.senderId];
    
    if (!sender) return null;
  
    const ReadReceipt = () => {
      if (message.status === 'seen') return <CheckCheck size={16} className="text-blue-400" />;
      if (message.status === 'delivered') return <CheckCheck size={16} />;
      return <Check size={16} />;
    };
  
    return (
      <div className={`flex items-end gap-2 ${isSent ? 'justify-end' : ''}`}>
        {!isSent && <img src={sender.avatar} alt="" className="w-8 h-8 rounded-full self-start"/>}
        <div
          className={`max-w-md p-3 rounded-2xl ${
            isSent ? 'bg-blue-500 text-white rounded-br-md' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
          }`}
        >
          <p className="text-sm">{message.content}</p>
          <div className={`flex items-center gap-1.5 text-xs mt-1 ${isSent ? 'text-blue-200 justify-end' : 'text-slate-400 justify-start'}`}>
            <span>{message.timestamp}</span>
            {isSent && <ReadReceipt />}
          </div>
        </div>
      </div>
    );
};
  
const TypingIndicator = ({ user }) => {
    if (!user) return null;
    return (
        <div className="flex items-end gap-2">
        <img src={user.avatar} alt="" className="w-8 h-8 rounded-full self-start"/>
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
  
const WelcomeScreen = () => {
      return (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-slate-200/50 dark:bg-slate-900/50 p-4">
              <MessageSquarePlus size={80} className="text-slate-400 dark:text-slate-600 mb-4" />
              <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-300">Welcome to Modern Chat</h2>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm">Select a chat to start messaging. Your conversations will appear here.</p>
          </div>
      );
};
