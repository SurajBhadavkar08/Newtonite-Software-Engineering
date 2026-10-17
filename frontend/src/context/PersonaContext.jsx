import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setApiPersona } from '../api/client';

const PersonaContext = createContext();

export function PersonaProvider({ children }) {
  const [personas, setPersonas] = useState([]);
  const [activePersona, setActivePersona] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      const data = await api.getPersonas();
      setPersonas(data);
      const savedUsername = localStorage.getItem('newtonite_persona');
      const defaultUser = data.find(p => p.username === savedUsername) ||
                          data.find(p => p.username === 'david_kim') ||
                          data[0];
      if (defaultUser) {
        setActivePersona(defaultUser);
        setApiPersona(defaultUser.username);
      }
    } catch (err) {
      console.error('Failed to load personas:', err);
    } finally {
      setLoading(false);
    }
  };

  const switchPersona = (personaOrUsername) => {
    const target = typeof personaOrUsername === 'string'
      ? personas.find(p => p.username === personaOrUsername)
      : personaOrUsername;

    if (target) {
      setActivePersona(target);
      setApiPersona(target.username);
      localStorage.setItem('newtonite_persona', target.username);
    }
  };

  return (
    <PersonaContext.Provider value={{ personas, activePersona, switchPersona, loading, refreshPersonas: loadPersonas }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const context = useContext(PersonaContext);
  if (!context) {
    throw new Error('usePersona must be used within a PersonaProvider');
  }
  return context;
}
