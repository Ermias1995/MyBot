import { useCallback, useEffect, useState } from 'react';
import { initTelegram } from './lib/telegram';
import AddExpense from './screens/AddExpense';
import Budgets from './screens/Budgets';
import Dashboard from './screens/Dashboard';
import Transactions from './screens/Transactions';

export default function App() {
  const [screen, setScreen] = useState('dashboard');
  const [dashKey, setDashKey] = useState(0);

  useEffect(() => {
    initTelegram();
  }, []);

  const goDashboard = useCallback(() => setScreen('dashboard'), []);
  const refreshDashboard = useCallback(() => {
    setDashKey((k) => k + 1);
    setScreen('dashboard');
  }, []);

  if (screen === 'add') {
    return <AddExpense onClose={goDashboard} onSaved={refreshDashboard} />;
  }
  if (screen === 'budgets') {
    return <Budgets onClose={goDashboard} />;
  }
  if (screen === 'transactions') {
    return (
      <Transactions
        onClose={goDashboard}
        onAdd={() => setScreen('add')}
      />
    );
  }

  return (
    <Dashboard
      key={dashKey}
      onAdd={() => setScreen('add')}
      onBudgets={() => setScreen('budgets')}
      onTransactions={() => setScreen('transactions')}
    />
  );
}
