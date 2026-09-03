import { useState } from 'react';
import { ShieldAlert, X, PhoneCall } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function EmergencySOS({ onTrigger }: { onTrigger: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);

  const handleTrigger = () => {
    setIsTriggered(true);
    onTrigger();
    setTimeout(() => {
      setIsOpen(false);
      setIsTriggered(false);
    }, 5000);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 text-rose-600 shadow-sm border-2 border-rose-200 active:scale-95 transition-transform"
        aria-label="Emergency SOS"
      >
        <ShieldAlert size={32} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 overflow-hidden relative"
            >
              <button 
                onClick={() => !isTriggered && setIsOpen(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-2"
                disabled={isTriggered}
              >
                <X size={28} />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-6 shadow-inner">
                  <ShieldAlert size={48} strokeWidth={2} />
                </div>
                <h2 className="text-3xl font-bold text-stone-900 mb-2">Emergency SOS</h2>
                
                {!isTriggered ? (
                  <>
                    <p className="text-stone-600 text-xl mb-8 leading-relaxed">
                      Do you need immediate help? This will alert your family and trigger the siren.
                    </p>
                    <button 
                      onClick={handleTrigger}
                      className="w-full py-5 rounded-2xl bg-rose-600 text-white text-2xl font-bold hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-lg shadow-rose-600/30"
                    >
                      Send Help Now
                    </button>
                    <button 
                      onClick={() => setIsOpen(false)}
                      className="w-full mt-4 py-4 rounded-2xl text-stone-600 text-xl font-medium hover:bg-stone-100 active:bg-stone-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                     <p className="text-rose-600 text-2xl font-bold mb-4 flex items-center gap-3">
                       <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 0.5 }}>
                         <PhoneCall size={32} />
                       </motion.div>
                       Alerting Family...
                     </p>
                     <p className="text-stone-600 text-xl leading-relaxed">
                       Please stay calm. A notification and call have been dispatched to your emergency contacts.
                     </p>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
