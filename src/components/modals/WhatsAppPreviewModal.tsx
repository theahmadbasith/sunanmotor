"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom"; // <-- KUNCI 1: Import React Portal

interface WhatsAppPreviewModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  onSend: () => void;
  onEdit: (newMessage: string) => void;
}

const formatWaText = (text: string) => {
  if (!text) return { __html: "" };
  
  const formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>") // Bold
    .replace(/_(.*?)_/g, "<em>$1</em>") // Italic
    .replace(/~(.*?)~/g, "<del>$1</del>") // Strikethrough
    .replace(/\n/g, "<br />"); // Line break

  return { __html: formatted };
};

export default function WhatsAppPreviewModal({
  isOpen,
  message,
  onClose,
  onSend,
  onEdit,
}: WhatsAppPreviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedMessage, setEditedMessage] = useState(message);
  
  // State untuk memastikan React Portal hanya berjalan di sisi Client (bukan SSR)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setEditedMessage(message);
  }, [message]);

  if (!mounted || !isOpen) return null;

  const handleSave = () => {
    onEdit(editedMessage);
    setIsEditing(false);
  };

  const handleSend = () => {
    if (isEditing) {
      onEdit(editedMessage);
      setTimeout(() => onSend(), 50); 
    } else {
      onSend();
    }
  };

  const currentTime = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Isi dari Modal
  const modalContent = (
    // KUNCI 2: Padding aman (Safe Area) & Z-index maksimal
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
      
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div 
        // KUNCI 3: Menggunakan `dvh` (Dynamic Viewport Height) agar adaptif di Safari iOS
        className="relative w-full max-w-[480px] h-full max-h-[85dvh] sm:max-h-[700px] bg-white dark:bg-[#111b21] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200"
      >
        {/* Header - WhatsApp Style */}
        <div className="bg-[#00a884] dark:bg-[#202c33] px-4 py-3 shrink-0 flex items-center justify-between shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center p-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-white">
                <path d="M187.58,144.84l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88,40,40,0,0,0,40-40A8,8,0,0,0,187.58,144.84ZM152,176a72.08,72.08,0,0,1-72-72A24,24,0,0,1,99.29,80.46l11.48,23L101,118a8,8,0,0,0-.73,7.51,56.47,56.47,0,0,0,30.15,30.15A8,8,0,0,0,138,155l14.61-9.74,23,11.48A24,24,0,0,1,152,176ZM128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">Kirim Laporan via WA</h2>
              <p className="text-xs text-white/80">
                {isEditing ? "Edit Pesan" : "Pratinjau Pesan"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-6 h-6 fill-white">
              <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className={`flex-1 flex flex-col relative overflow-hidden ${isEditing ? 'bg-white dark:bg-[#111b21]' : 'bg-[#efeae2] dark:bg-[#0b141a]'}`}>
          
          {/* Chat Pattern Overlay */}
          {!isEditing && (
            <div 
              className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none" 
              style={{ backgroundImage: `url('https://static.whatsapp.net/rsrc.php/v3/yl/r/r2t1a6vU867.png')`, backgroundRepeat: 'repeat' }}
            />
          )}

          {isEditing ? (
            // ================= MODE EDIT =================
            <div className="flex-1 flex flex-col w-full h-full transition-opacity duration-200">
              <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-[11px] px-4 py-2.5 flex items-center gap-2.5 border-b border-yellow-200 dark:border-yellow-800/50 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current shrink-0">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/>
                </svg>
                <span>Gunakan tanda <b>*teks*</b> untuk tebal, <b>_teks_</b> untuk miring.</span>
              </div>
              
              <textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                className="flex-1 w-full p-4 bg-transparent text-gray-900 dark:text-[#e9edef] outline-none resize-none text-[15px] leading-relaxed font-sans"
                placeholder="Ketik pesan Anda di sini..."
              />
            </div>
          ) : (
            // ================= MODE PREVIEW =================
            <div className="flex-1 overflow-y-auto p-4 flex flex-col relative z-10 scroll-smooth">
              <div className="w-full max-w-[92%] self-end mt-auto">
                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] p-2.5 rounded-[12px] rounded-tr-none shadow-sm relative">
                  {/* Decorative Tail */}
                  <div className="absolute top-0 -right-2 w-3 h-4 overflow-hidden">
                    <div className="w-4 h-4 bg-[#d9fdd3] dark:bg-[#005c4b] rounded-bl-sm transform -rotate-45 -translate-y-2 translate-x-1" />
                  </div>
                  
                  {/* Message Content */}
                  <div 
                    className="text-[15px] leading-[1.4] whitespace-pre-wrap break-words px-1 pb-1"
                    dangerouslySetInnerHTML={formatWaText(editedMessage)}
                  />
                  
                  {/* Timestamp & Read Tick */}
                  <div className="flex items-center justify-end gap-1 mt-1 mr-1 float-right">
                    <span className="text-[11px] text-gray-500 dark:text-white/60">
                      {currentTime}
                    </span>
                    <svg viewBox="0 0 16 15" width="16" height="15" className="fill-gray-400 dark:fill-white/50">
                      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
                    </svg>
                  </div>
                  <div className="clear-both" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-4 shrink-0 flex gap-3 z-10 border-t border-gray-200 dark:border-gray-700/50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-4">
          {isEditing ? (
            <>
              <button
                onClick={() => { setIsEditing(false); setEditedMessage(message); }}
                className="flex-1 py-3 rounded-xl bg-white dark:bg-[#111b21] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold text-sm transition-colors shadow-md"
              >
                Simpan Pesan
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 py-3 rounded-xl bg-white dark:bg-[#111b21] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-4 h-4 fill-current">
                  <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
                </svg>
                Edit Pesan
              </button>
              <button
                onClick={handleSend}
                className="flex-1 py-3 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-[#00a884]/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="w-5 h-5 fill-white">
                  <path d="M231.87,86l-176-64A16,16,0,0,0,35.93,37.93l0,.12L64.37,128,35.93,217.95l0,.12A16,16,0,0,0,56,240a16.15,16.15,0,0,0,5.93-1.12l176-64a16,16,0,0,0,0-29.75ZM56,224h0L82.87,136H144a8,8,0,0,0,0-16H82.87L56,32l176,64Z" />
                </svg>
                Kirim WA
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // KUNCI 4: Gunakan createPortal untuk merender modal di bagian paling luar struktur HTML (document.body)
  return createPortal(modalContent, document.body);
}
