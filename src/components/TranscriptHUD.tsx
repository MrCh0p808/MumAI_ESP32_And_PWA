import { useEffect, useRef } from 'react';
import { TranscriptMessage } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export function TranscriptHUD({ messages }: { messages: TranscriptMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div 
      ref={scrollRef}
      className="w-full max-w-lg mx-auto h-56 overflow-y-auto px-6 space-y-4 pb-12"
      style={{ maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 70%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 70%, transparent)' }}
    >
      {messages.length === 0 && (
         <p className="text-center text-stone-400 font-semibold text-2xl mt-16 px-4">
           Tap the mic and say "Namaste Maa" to begin...
         </p>
      )}
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div 
              className={`max-w-[85%] p-5 rounded-3xl text-xl font-medium leading-snug shadow-sm border ${
                msg.role === 'user' 
                  ? 'bg-orange-100 text-orange-900 border-orange-200/50 rounded-br-sm' 
                  : 'bg-white border-stone-200/60 text-stone-800 rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
