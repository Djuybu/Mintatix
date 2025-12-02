import { useAccount, useConnect, useReconnect } from 'wagmi'
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { hardhat } from 'wagmi/chains'; //we have to import hardhat to use this chain with the dapp
//custom hooks
import AccountHeader from './components/AccountHeader'
import Disconnect from './components/Disconnect';
import ChainSwitcher from './components/ChainSwitcher';
import Menu from './components/Menu';
//events page
import EventGrid from './components/Events/EventGrid';
import EventDetailPage from './components/Events/EventDetailPage.tsx';

import MyTickets from './components/MyTickets/MyTickets.tsx';

import EventGridResales from './components/Resale/EventGridResales.tsx';
import EventDetailPageResale from './components/Resale/EventDetailPageResale.tsx';
import NewEventPage from "./components/Events/NewEventPage";

import SignUpPage from './components/SignUp';
import OrganizerPage from './components/OrganizerPage';

function App() {

  const account = useAccount(); //get the account information, like the address and the chainId
  const { connect, error } = useConnect(); //coonect to the wallet or get an error if the conection fails
  const { reconnect, connectors } = useReconnect(); //hook for reconnect the wallet if the connection is lost)

  // control if the user is connected or not
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false);

  // useEffect runs on every render so the recoonect will try to reconnect the wallet in every render, 
  useEffect(() => { 
    reconnect({ connectors }); //call the reconnect function with the connectors available
  }, [reconnect, connectors]); // will try to reconnect if renders (ex: when the mobile dapp go to the wallet app and returns)

  // dfunction sthat put the variable to true or false, will be used like a callback to the function and app.tsx will react to the change 
  const openDisconnect = () => setIsDisconnectOpen(true);
  const closeDisconnect = () => setIsDisconnectOpen(false);

  // connectors for two wallets (as i seen, injected is like comodin for connect the wallet that usr has in the browser)
  const metamaskConnector = connectors.find(c => c.name.toLowerCase().includes('metamask'));
  const coinbaseConnector = connectors.find(c => c.name.toLowerCase().includes('coinbase'));
  const injectedConnector = connectors.find(c => c.name.toLowerCase().includes('injected'));
  const walletConnectConnector = connectors.find(c => c.name.toLowerCase().includes('walletconnect'));

  // case 1: the user is in the wrong chain
  if (account.isConnected && account.address && account.chainId !== hardhat.id) {
    return (
      <div className="main-layout"> {/* this components will be there in all screens of the Dapp */}

        {/* shows the first three characters of the account and the last three characters 
            bc the user may have more than one addreedd and needs to ensure what address is connceted*/}
        <AccountHeader address={JSON.stringify(account.address)} onClick={openDisconnect} />

        {/* creates a button to redirect the user to the correct chain */} 
        <ChainSwitcher targetChainId={hardhat.id} />

        {/* if the user wants to disconnect the wallet */}
        <Disconnect isOpen={isDisconnectOpen} onClose={closeDisconnect} />
      </div>
    );
  }

  return (
  <BrowserRouter basename='/'>
    <div className={`main-layout ${account.isConnected && account.chainId === hardhat.id ? 'menu-visible' : ''}`}>
      <div className="content">
        {account.isConnected && account.address && account.chainId === hardhat.id ? (
          <>
            <Disconnect isOpen={isDisconnectOpen} onClose={closeDisconnect} />
            <Menu />
            <AccountHeader address={JSON.stringify(account.address)} onClick={openDisconnect} />
            <ChainSwitcher targetChainId={hardhat.id} />

            <Routes>
              <Route path="/" element={<Navigate to="/events" replace />} />
              <Route path="/events" element={<EventGrid />} />
              <Route path="/resales" element={<EventGridResales />} />
              <Route path="/myTickets" element={<MyTickets />} />
              <Route path="/event/:eventAddress" element={<EventDetailPage />} />
              <Route path="/eventResale/:eventAddress" element={<EventDetailPageResale />} />
              <Route path="/events/new" element={<NewEventPage />} />
              <Route path='/organizer' element={<OrganizerPage />} />
            </Routes>
          </>
        ) : (
          // NHÁNH CHƯA CONNECT: có route /signup
          <Routes>
            {/* Trang Sign Up */}
            <Route path="/signup" element={<SignUpPage />} />

            {/* Mặc định: màn hình welcome + nút connect + link sang signup */}
            <Route
              path="*"
              element={
                <div className="page-container" style={{ textAlign: 'center' }}>
                  <h1>Welcome to Mintatix!</h1>
                  <div className="spacer" />
                  <p>Please, connect your wallet to start using the Dapp.</p>

                  <div className="buttons-container">
                    {metamaskConnector && (
                      <button className="button" onClick={() => connect({ connector: metamaskConnector })}>
                        Connect with MetaMask
                      </button>
                    )}
                    {coinbaseConnector && (
                      <button className="button" onClick={() => connect({ connector: coinbaseConnector })}>
                        Connect with Coinbase
                      </button>
                    )}
                    {walletConnectConnector && (
                      <button className="button" onClick={() => connect({ connector: walletConnectConnector })}>
                        Connect with WalletConnect
                      </button>
                    )}
                    {injectedConnector && (
                      <button className="button" onClick={() => connect({ connector: injectedConnector })}>
                        Autoconnect
                      </button>
                    )}
                  </div>

                  {/* Link sang trang tạo tài khoản + ví mới */}
                  <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
                    New here?{" "}
                    <Link to="/signup" style={{ textDecoration: 'underline' }}>
                      Create an account & wallet
                    </Link>
                  </p>

                  {error && !error.message.includes('User rejected the request') && (
                    <div className="message error-message">
                      {error.message}
                    </div>
                  )}
                </div>
              }
            />
          </Routes>
        )}
      </div>
    </div>
  </BrowserRouter>
);

}

export default App;
