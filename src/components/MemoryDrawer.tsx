import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, X, Pill, Clock, AlertCircle, Heart } from 'lucide-react';
import { MemoryRecord } from '../types';

export function MemoryDrawer({ memories }: { memories: MemoryRecord[] }) {
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = (category: string) => {
    switch(category) {
      case 'medical': return <Pill size={32} className="text-blue-500" />;
      case 'routine': return <Clock size={32} className="text-emerald-500" />;
      case 'alert': return <AlertCircle size={32} className="text-rose-500" />;
      default: return <Heart size={32} className="text-orange-500" />;
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-16 h-16 rounded-full bg-white text-stone-700 shadow-sm border-2 border-stone-200 active:bg-stone-50 transition-colors"
        aria-label="Memory Inspector"
      >
        <BrainCircuit size={32} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-stone-50 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-stone-200 bg-white shadow-sm">
                <h2 className="text-2xl font-bold text-stone-900 flex items-center gap-3">
                  <BrainCircuit className="text-orange-600" size={32} />
                  Episodic Memory
                </h2>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-3 bg-stone-100 rounded-full text-stone-600 active:bg-stone-200"
                  aria-label="Close"
                >
                  <X size={28} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {memories.length === 0 ? (
                  <p className="text-stone-500 text-center text-xl mt-10">No memories logged yet.</p>
                ) : (
                  memories.map(memory => (
                    <div key={memory.id} className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 flex gap-4 items-start">
                       <div className="mt-1 bg-stone-50 p-4 rounded-full h-fit border border-stone-100">
                         {getIcon(memory.category)}
                       </div>
                       <div>
                         <p className="text-stone-900 text-xl font-medium leading-tight">{memory.content}</p>
                         <p className="text-stone-500 text-base mt-2 font-medium">{memory.timestamp.toLocaleString()}</p>
                       </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
