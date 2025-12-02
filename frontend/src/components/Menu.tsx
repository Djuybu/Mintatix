import { NavLink } from 'react-router-dom';
import { FaUser, FaTicketAlt, FaExchangeAlt } from 'react-icons/fa';
import { useAccount, useReadContract } from 'wagmi';

import logo from '../mintatix_ico_transparent.png';
import factoryContract from '../contracts/EventTicketFactory.json';
import factoryAddr from '../contracts/FactoryAddress.json';

import './css/Menu.css';

const Menu = () => {
  const { address: userAddress } = useAccount();

  // Đọc owner của factory
  const { data: factoryOwner } = useReadContract({
    address: factoryAddr.address as `0x${string}`,
    abi: factoryContract.abi,
    functionName: 'owner',
  });

  // Kiểm tra user có phải factoryAdmin không
  const { data: isFactoryAdmin } = useReadContract({
    address: factoryAddr.address as `0x${string}`,
    abi: factoryContract.abi,
    functionName: 'factoryAdmins',
    args: [userAddress ?? '0x0000000000000000000000000000000000000000'],
    query: {
      enabled: !!userAddress,
    },
  });

  const isAdmin =
    !!userAddress &&
    (userAddress.toLowerCase() === (factoryOwner as string | undefined)?.toLowerCase() ||
      Boolean(isFactoryAdmin));

  const resaleLabel = isAdmin ? 'All Tickets' : 'Resale';
  const myTicketsLabel = isAdmin ? 'Confirm Ticket' : 'My Tickets';

  return (
    <nav className="side-menu">
      <NavLink to="/events" className="menu-logo">
        <img src={logo} alt="Logo" />
        <span className="logo-text">Mintatix</span>
      </NavLink>

      <ul className="menu-items">
        <li className="menu-item">
          <NavLink
            to="/events"
            className={({ isActive }) =>
              isActive ? 'menu-link active' : 'menu-link'
            }
          >
            <FaTicketAlt className="menu-icon" />
            <span className="menu-label">Events</span>
          </NavLink>
        </li>

        <li className="menu-item">
          <NavLink
            to="/resales"
            className={({ isActive }) =>
              isActive ? 'menu-link active' : 'menu-link'
            }
          >
            <FaExchangeAlt className="menu-icon" />
            <span className="menu-label">{resaleLabel}</span>
          </NavLink>
        </li>

        <li className="menu-item">
          <NavLink
            to="/myTickets"
            className={({ isActive }) =>
              isActive ? 'menu-link active' : 'menu-link'
            }
          >
            <FaUser className="menu-icon" />
            <span className="menu-label">{myTicketsLabel}</span>
          </NavLink>
        </li>

        {/* Chỉ hiện tab Organizer cho Admin (owner hoặc factoryAdmin) */}
        {isAdmin && (
          <li className="menu-item">
            <NavLink
              to="/organizer"
              className={({ isActive }) =>
                isActive ? 'menu-link active' : 'menu-link'
              }
            >
              <FaUser className="menu-icon" />
              <span className="menu-label">Organizer</span>
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
};

export default Menu;
