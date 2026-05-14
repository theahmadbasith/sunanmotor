"use client";

type TabName = "dashboard" | "beli" | "add-motor" | "pengeluaran" | "history";

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

const LEFT_TABS = [
  { id: "beli", label: "Beli" },
  { id: "add-motor", label: "Jual" },
] as const;

const RIGHT_TABS = [
  { id: "pengeluaran", label: "Pengeluaran" },
  { id: "history", label: "Riwayat" },
] as const;

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  
  // Fungsi helper untuk merender ikon dengan transisi garis ke penuh (Outlined -> Solid)
  const renderIcon = (id: string, isActive: boolean) => {
    switch (id) {
      case "dashboard": // Ikon Beranda
        return isActive ? (
          <path fill="currentColor" d="M12 3L2 12h3v8a2 2 0 0 0 2 2h4v-7h2v7h4a2 2 0 0 0 2-2v-8h3L12 3z"/>
        ) : (
          <>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10"/>
          </>
        );

      case "beli": // Ikon Tas Belanja (Beli Motor/Sparepart)
        return isActive ? (
          <path fill="currentColor" d="M19 6h-3V5a4 4 0 0 0-8 0v1H5L3 8v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-2-2zm-9-1a2 2 0 0 1 4 0v1h-4V5zm-2 7a2 2 0 0 0 4 0h2a4 4 0 0 1-8 0h2z"/>
        ) : (
          <>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 6h18"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 10a4 4 0 0 1-8 0"/>
          </>
        );

      case "add-motor": // Ikon Label Harga (Jual Motor)
        return isActive ? (
          <path fill="currentColor" d="M2 2v10l8.59 8.59a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.82L12 2H2zm5.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
        ) : (
          <>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <circle cx="7" cy="7" r="1" fill="currentColor"/>
          </>
        );

      case "pengeluaran": // Ikon Dompet (Keuangan)
        return isActive ? (
          <path fill="currentColor" d="M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2h-4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4V7a2 2 0 0 0-2-2zm-2 9v-2h4v2h-4z"/>
        ) : (
          <>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 10h5v4h-5z"/>
          </>
        );

      case "history": // Ikon Riwayat/Jam
        return isActive ? (
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.29 12.71L11 11.41V6h2v4.59l3.71 3.71-1.42 1.41z"/>
        ) : (
          <>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/>
          </>
        );

      default:
        return null;
    }
  };

  const NavItem = ({ id, label }: { id: TabName; label: string }) => {
    const isActive = activeTab === id;
    
    return (
      <button
        className="relative flex flex-col items-center justify-center w-[20%] h-full group outline-none"
        onClick={() => onTabChange(id)}
        aria-label={label}
      >
        {/* Background pill untuk memberikan efek glow ringan saat aktif */}
        <div 
          className={`absolute top-2 w-12 h-8 rounded-full transition-all duration-300 ease-out flex items-center justify-center
            ${isActive ? "bg-indigo-50 dark:bg-indigo-500/10 scale-100" : "bg-transparent scale-50 opacity-0"}`} 
        />
        
        {/* Kontainer SVG untuk menangani animasi popping/bouncing */}
        <div 
          className={`relative z-10 flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:scale-90
            ${isActive ? "scale-110 text-indigo-600 dark:text-indigo-400" : "scale-100 text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 group-hover:scale-105"}`}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            className="w-[24px] h-[24px] mb-1 transition-colors duration-300"
          >
            {renderIcon(id, isActive)}
          </svg>
        </div>

        <span 
          className={`text-[10px] tracking-tight transition-all duration-300 group-active:scale-95
            ${isActive ? "text-indigo-700 dark:text-indigo-400 font-bold" : "text-gray-500 dark:text-gray-400 font-medium"}`}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 w-full z-[90] shrink-0 filter drop-shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:drop-shadow-[0_-4px_12px_rgba(0,0,0,0.25)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Background solid 100% tanpa efek tembus pandang (transparan/blur) */}
      <div 
        className="absolute inset-0 bg-white dark:bg-[#0f172a] border-t border-gray-200 dark:border-gray-800"
        style={{
          WebkitMaskImage: "radial-gradient(circle at 50% 14px, transparent 32px, black 33px)",
          maskImage: "radial-gradient(circle at 50% 14px, transparent 32px, black 33px)",
        }}
      />

      <div className="flex justify-between items-end px-2 relative w-full max-w-md mx-auto h-[64px]">
        
        {/* Kiri Tabs */}
        {LEFT_TABS.map((tab) => (
          <NavItem key={tab.id} id={tab.id as TabName} label={tab.label} />
        ))}

        {/* CENTER FAB: Tombol Beranda */}
        <div className="relative flex flex-col items-center justify-start w-[20%] h-full">
          
          <button
            className={`absolute -top-[14px] flex items-center justify-center w-[56px] h-[56px] rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] outline-none active:scale-90
              ${activeTab === "dashboard"
                ? "bg-indigo-600 shadow-indigo-500/40 scale-105"
                : "bg-indigo-500 shadow-indigo-500/20 hover:scale-105 hover:bg-indigo-600"}`}
            onClick={() => onTabChange("dashboard")}
            aria-label="Beranda"
          >
            <div className={`transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${activeTab === "dashboard" ? "scale-110" : "scale-100"}`}>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-6 h-6 text-white"
              >
                {/* Paksa true agar ikon beranda selalu berupa desain Solid */}
                {renderIcon("dashboard", true)}
              </svg>
            </div>
          </button>

          <span 
            className={`absolute bottom-[6px] text-[10px] tracking-tight transition-colors duration-300
              ${activeTab === "dashboard" ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-500 dark:text-gray-400 font-medium"}`}
          >
            Beranda
          </span>
        </div>

        {/* Kanan Tabs */}
        {RIGHT_TABS.map((tab) => (
          <NavItem key={tab.id} id={tab.id as TabName} label={tab.label} />
        ))}

      </div>
    </nav>
  );
}
