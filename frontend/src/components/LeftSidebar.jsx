import React from 'react';

const NAV_ITEMS = [
  { id: 'trades', icon: '⇅', label: 'Trades' },
  { id: 'market', icon: '◎', label: 'Market' },
  { id: 'research', icon: '⚗', label: 'Research' },
  { id: 'agents', icon: '⬡', label: 'Agents' },
  { id: 'stats',  icon: '◈', label: 'Stats' },
  { id: 'builder', icon: '⚙', label: 'Builder' },
  { id: 'help',   icon: 'ℹ', label: 'Info' },
];

export default function LeftSidebar({ activeTab, onTabChange }) {
  return (
    <aside className="olymp-sidebar">
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
            title={item.label}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="online-indicator">
          <span className="dot"></span>
          <span className="text">Live</span>
        </div>
      </div>
    </aside>
  );
}
