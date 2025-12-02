import { useMemo, useState, useEffect } from 'react';
import {
  useAccount,
  useReadContract,
  useReadContracts,
  usePublicClient,
} from 'wagmi';
import type { Abi } from 'abitype';
import { parseAbiItem, formatUnits } from 'viem';

// abis
import factoryContract from '../../contracts/EventTicketFactory.json';
import eventLogicContract from '../../contracts/EventTicketLogic.json';
// address
import factoryAddr from '../../contracts/FactoryAddress.json';

// components
import EventCardResale from './EventCardResale';
import PageTitle from '../PageTitle';

import '../css/EventGrid.css';

type PurchaseType = 'primary' | 'resale';

type TicketTrade = {
  buyer: `0x${string}`;
  eventAddress: `0x${string}`;
  purchaseType: PurchaseType;
  price: bigint;
  timestamp: bigint;
  quantity: bigint; // 👈 thêm số lượng vé
};

// event TicketsMinted(address indexed user, uint256 quantity);
const ticketsMintedEvent = parseAbiItem(
  'event TicketsMinted(address indexed user, uint256 quantity)'
);

// event TicketSold(uint256 indexed tokenID, address buyer, uint256 price);
const ticketSoldEvent = parseAbiItem(
  'event TicketSold(uint256 indexed tokenID, address buyer, uint256 price)'
);

const EventGridResales = () => {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();

  // 1. Lấy danh sách tất cả event logic contracts từ factory
  const {
    data: allEventsData,
    isLoading: isLoadingEvents,
    isError: isErrorEvents,
  } = useReadContract({
    abi: factoryContract.abi,
    address: factoryAddr.address as `0x${string}`,
    functionName: 'getEvents',
  });

  const allEvents: `0x${string}`[] = useMemo(() => {
    if (Array.isArray(allEventsData)) {
      return allEventsData as `0x${string}`[];
    }
    return [];
  }, [allEventsData]);

  // 2. RBAC: kiểm tra user có phải admin trong BẤT KỲ event nào không (mapping admins)
  const adminCheckContracts = useMemo(() => {
    if (!userAddress || allEvents.length === 0) return [];
    return allEvents.map((eventAddr) => ({
      address: eventAddr,
      abi: eventLogicContract.abi as Abi,
      functionName: 'admins', // mapping public admins(address) -> bool
      args: [userAddress],
    }));
  }, [allEvents, userAddress]);

  const {
    data: adminFlags,
    isLoading: isLoadingAdmins,
    isError: isErrorAdmins,
  } = useReadContracts({
    contracts: adminCheckContracts,
    query: { enabled: !!userAddress && allEvents.length > 0 },
  });

  const isAdmin = useMemo(() => {
    if (!userAddress) return false;
    if (!adminFlags || !Array.isArray(adminFlags)) return false;

    return adminFlags.some((res) => {
      const r = res as { result?: boolean; status: 'success' | 'failure' };
      return r.status === 'success' && r.result === true;
    });
  }, [adminFlags, userAddress]);

  // 3. Đọc eventEndTime cho từng event
  const eventEndTimeContracts = useMemo(
    () =>
      allEvents.map((eventAddress) => ({
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'eventEndTime',
      })),
    [allEvents]
  );

  const {
    data: endTimeData,
    isLoading: isLoadingEndTime,
    isError: isErrorEndTime,
  } = useReadContracts({
    contracts: eventEndTimeContracts,
    query: { enabled: !isLoadingEvents && allEvents.length > 0 },
  });

  // 4. Đọc startPurchaseTime cho từng event
  const eventsStartPurchaseTimeContracts = useMemo(
    () =>
      allEvents.map((eventAddress) => ({
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'startPurchaseTime',
      })),
    [allEvents]
  );

  const {
    data: startPurchaseTimeData,
    isLoading: isLoadingStartPurchaseTime,
    isError: isErrorStartPurchaseTime,
  } = useReadContracts({
    contracts: eventsStartPurchaseTimeContracts,
    query: { enabled: !isLoadingEvents && allEvents.length > 0 },
  });

  // 5. Đọc ticketPrice cho từng event (dùng cho "mua mới")
  const ticketPriceContracts = useMemo(
    () =>
      allEvents.map((eventAddress) => ({
        address: eventAddress,
        abi: eventLogicContract.abi as Abi,
        functionName: 'ticketPrice',
      })),
    [allEvents]
  );

  const {
    data: ticketPriceData,
    isLoading: isLoadingTicketPrice,
    isError: isErrorTicketPrice,
  } = useReadContracts({
    contracts: ticketPriceContracts,
    query: { enabled: !isLoadingEvents && allEvents.length > 0 },
  });

  const ticketPrices = useMemo(() => {
    const map: Record<string, bigint> = {};
    if (!ticketPriceData || !Array.isArray(ticketPriceData)) return map;

    ticketPriceData.forEach((res, idx) => {
      const r = res as { result?: bigint; status: 'success' | 'failure' };
      if (r.status === 'success' && r.result !== undefined) {
        const addr = allEvents[idx]?.toLowerCase();
        if (addr) {
          map[addr] = r.result;
        }
      }
    });

    return map;
  }, [ticketPriceData, allEvents]);

  // 6. Lọc ra các event đang active để resale
  const activeEvents = useMemo(() => {
    if (
      endTimeData &&
      !isLoadingEndTime &&
      Array.isArray(endTimeData) &&
      startPurchaseTimeData &&
      !isLoadingStartPurchaseTime &&
      Array.isArray(startPurchaseTimeData)
    ) {
      const currentTimeSeconds = BigInt(Math.floor(Date.now() / 1000));

      const addresses: `0x${string}`[] = [];
      const endTimes: bigint[] = [];

      endTimeData.forEach((result, index) => {
        const active = result as { result?: bigint; status: 'success' | 'failure' };

        if (active.status === 'success' && active.result !== null && active.result !== undefined) {
          const startTime = startPurchaseTimeData[index].result as bigint;

          if (active.result > currentTimeSeconds && startTime <= currentTimeSeconds) {
            addresses.push(allEvents[index]);
            endTimes.push(active.result);
          }
        }
      });

      return { addresses, endTimes };
    }
    return { addresses: [], endTimes: [] };
  }, [
    allEvents,
    endTimeData,
    isLoadingEndTime,
    startPurchaseTimeData,
    isLoadingStartPurchaseTime,
  ]);

  // 7. Lấy log giao dịch mua / resale
  const [ticketTrades, setTicketTrades] = useState<TicketTrade[]>([]);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return; // chỉ admin mới xem bảng giao dịch
    if (!publicClient) return;
    if (allEvents.length === 0) return;
    if (isLoadingTicketPrice || isErrorTicketPrice) return;

    let cancelled = false;

    const fetchTrades = async () => {
      try {
        setIsLoadingTrades(true);
        setTradesError(null);

        const [mintLogs, soldLogs] = await Promise.all([
          publicClient.getLogs({
            address: allEvents,
            event: ticketsMintedEvent,
            fromBlock: 0n,
          }),
          publicClient.getLogs({
            address: allEvents,
            event: ticketSoldEvent,
            fromBlock: 0n,
          }),
        ]);

        if (cancelled) return;

        // Cache timestamp theo blockHash
        const tsCache = new Map<string, bigint>();
        const getTimestamp = async (blockHash: `0x${string}`) => {
          const key = blockHash.toLowerCase();
          const cached = tsCache.get(key);
          if (cached !== undefined) return cached;
          const block = await publicClient.getBlock({ blockHash });
          const ts = BigInt(block.timestamp);
          tsCache.set(key, ts);
          return ts;
        };

        // Giao dịch "mua mới"
        const primaryTrades: TicketTrade[] = await Promise.all(
          mintLogs.map(async (log) => {
            const buyer = log.args.user as `0x${string}`;
            const quantity = log.args.quantity as bigint;
            const eventAddress = log.address as `0x${string}`;
            const timestamp = await getTimestamp(log.blockHash as `0x${string}`);

            const basePrice = ticketPrices[eventAddress.toLowerCase()] ?? 0n;
            const totalPrice = basePrice * quantity;

            return {
              buyer,
              eventAddress,
              purchaseType: 'primary',
              price: totalPrice,
              timestamp,
              quantity, // 👈 số lượng vé từ event
            };
          })
        );

        // Giao dịch "mua từ resale" — mỗi lần 1 vé
        const resaleTrades: TicketTrade[] = await Promise.all(
          soldLogs.map(async (log) => {
            const buyer = log.args.buyer as `0x${string}`;
            const price = log.args.price as bigint;
            const eventAddress = log.address as `0x${string}`;
            const timestamp = await getTimestamp(log.blockHash as `0x${string}`);

            return {
              buyer,
              eventAddress,
              purchaseType: 'resale',
              price,
              timestamp,
              quantity: 1n, // 👈 ERC721: luôn 1 vé / giao dịch resale
            };
          })
        );

        const allTrades = [...primaryTrades, ...resaleTrades].sort(
          (a, b) => Number(b.timestamp) - Number(a.timestamp)
        );

        if (!cancelled) {
          setTicketTrades(allTrades);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setTradesError('Failed to load ticket trades');
      } finally {
        if (!cancelled) setIsLoadingTrades(false);
      }
    };

    fetchTrades();

    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    publicClient,
    allEvents,
    ticketPrices,
    isLoadingTicketPrice,
    isErrorTicketPrice,
  ]);

  const isLoading =
    isLoadingEvents ||
    isLoadingEndTime ||
    isLoadingStartPurchaseTime ||
    isLoadingAdmins ||
    isLoadingTicketPrice;

  const isError =
    isErrorEvents ||
    isErrorEndTime ||
    isErrorStartPurchaseTime ||
    isErrorAdmins ||
    isErrorTicketPrice;

  if (isLoading) return <p>Loading Active Events...</p>;
  if (isError)
    return (
      <p className="message error-message">
        Error: Something went wrong loading the active events
      </p>
    );

  return (
    <>
      <PageTitle />

      {/* 👑 Admin view: chỉ hiện bảng giao dịch, ẩn UI user */}
      {isAdmin && (
        <div className="page-container admin-page">
          <h2 className="section-title">Ticket Purchase / Resale History</h2>

          {isLoadingTrades && <p>Loading ticket trades...</p>}
          {tradesError && (
            <p className="message error-message">
              {tradesError}
            </p>
          )}

          {!isLoadingTrades && !tradesError && ticketTrades.length === 0 && (
            <p>No ticket trades found.</p>
          )}

          {!isLoadingTrades && !tradesError && ticketTrades.length > 0 && (
            <div className="event-grid-transactions">
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Người mua</th>
                    <th>Sự kiện</th>
                    <th>Loại mua</th>
                    <th>Số lượng</th>
                    <th>Giá</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketTrades.map((tx, idx) => (
                    <tr key={`${tx.buyer}-${tx.eventAddress}-${idx}`}>
                      <td title={tx.buyer}>
                        <span className="addr-mono">
                          {tx.buyer.slice(0, 6)}...{tx.buyer.slice(-4)}
                        </span>
                      </td>
                      <td title={tx.eventAddress}>
                        <span className="addr-mono">
                          {tx.eventAddress.slice(0, 6)}...{tx.eventAddress.slice(-4)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            tx.purchaseType === 'primary'
                              ? 'badge badge-primary'
                              : 'badge badge-resale'
                          }
                        >
                          {tx.purchaseType === 'primary' ? 'Mua mới' : 'Mua từ resale'}
                        </span>
                      </td>
                      <td className="tx-qty">
                        {tx.quantity.toString()}
                      </td>
                      <td>
                        {formatUnits(tx.price, 18)} ETH
                      </td>
                      <td>
                        {new Date(Number(tx.timestamp) * 1000).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 👤 User view: chỉ hiển thị nếu KHÔNG phải admin */}
      {!isAdmin && (
        <div className="page-container">
          <div className="event-grid">
            {activeEvents.addresses.length === 0 ? (
              <p>There are no active events at this time</p>
            ) : (
              activeEvents.addresses.map((addr, i) => (
                <EventCardResale
                  key={addr}
                  eventAddress={addr}
                  eventEndTime={activeEvents.endTimes[i]}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default EventGridResales;
