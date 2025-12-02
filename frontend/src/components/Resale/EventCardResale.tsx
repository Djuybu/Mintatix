import { useState, useEffect, useMemo } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { formatEventTimestamp, formatLocation } from '../utils';
import eventLogicContract from '../../contracts/EventTicketLogic.json';
import { MdLocationOn } from 'react-icons/md';
import { BsFillCalendarWeekFill } from 'react-icons/bs';
import { useNavigate } from 'react-router-dom';

import '../css/EventCard.css';

const EventCardResale = ({
  eventAddress,
  eventEndTime,
}: {
  eventAddress: string;
  eventEndTime: bigint;
}) => {
  const account = useAccount();

  // 1. Đọc eventURI, ticketsForSaleOfUsr, tokensOfOwner từ contract
  const {
    data: eventURIData,
    isLoading: isLoadingEventUri,
    isError: isErrorEventUri,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'eventURI',
  });

  const {
    data: ticketsForSaleOfUserData,
    isLoading: isLoadingTicketsForSaleOfUser,
    isError: isErrorTicketsForSaleOfUser,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'ticketsForSaleOfUsr',
    args: [account.address as `0x${string}`],
  });

  const {
    data: tokensOfOwnerData,
    isLoading: isLoadingTokensOfOwner,
    isError: isErrorTokensOfOwner,
  } = useReadContract({
    address: eventAddress as `0x${string}`,
    abi: eventLogicContract.abi,
    functionName: 'tokensOfOwner',
    args: [eventAddress as `0x${string}`],
  });

  // 2. State cho metadata IPFS
  const [eventJSON, setEventJSON] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isMetaLoading, setIsMetaLoading] = useState(false);

  // 3. Fetch metadata từ IPFS local gateway
  useEffect(() => {
    if (!eventURIData) {
      setEventJSON(null);
      setFetchError(null);
      setIsMetaLoading(false);
      return;
    }

    const cid = String(eventURIData).replace(/^ipfs:\/\//, '');
    const url = `http://127.0.0.1:8080/ipfs/${cid}`; // dùng gateway local

    let cancelled = false;

    const fetchEventData = async () => {
      try {
        setIsMetaLoading(true);
        setFetchError(null);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch event data: HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setEventJSON(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch event metadata (resale):', error);
          setFetchError((error as Error).message || 'Failed to fetch event metadata');
          setEventJSON(null);
        }
      } finally {
        if (!cancelled) {
          setIsMetaLoading(false);
        }
      }
    };

    fetchEventData();

    return () => {
      cancelled = true;
    };
  }, [eventURIData]);

  // 4. Tính sold-out cho resale
  const isSoldOut = useMemo(() => {
    if (ticketsForSaleOfUserData == undefined || tokensOfOwnerData == undefined) {
      return false;
    }

    if (!Array.isArray(tokensOfOwnerData) || tokensOfOwnerData.length === 0) {
      // nếu contract không còn ticket nào thì coi như sold out
      return true;
    }

    const userSaleSet = new Set<bigint>(
      Array.isArray(ticketsForSaleOfUserData) ? ticketsForSaleOfUserData : [],
    );

    const ticketsForSaleOfOtherUsrs = (tokensOfOwnerData as bigint[]).filter(
      tokenId => !userSaleSet.has(tokenId),
    );

    return ticketsForSaleOfOtherUsrs.length === 0;
  }, [ticketsForSaleOfUserData, tokensOfOwnerData]);

  const navigate = useNavigate();

  // 5. Loading/Error states
  const isLoading =
    isLoadingEventUri ||
    isLoadingTicketsForSaleOfUser ||
    isLoadingTokensOfOwner ||
    isMetaLoading;

  const isError =
    isErrorEventUri || isErrorTicketsForSaleOfUser || isErrorTokensOfOwner || !!fetchError;

  if (isLoading) {
    return (
      <div className="event-card loading">
        <p>Loading Event...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="event-card error">
        <p>Error loading event data:</p>
        <p>{fetchError || 'Contract read error'}</p>
      </div>
    );
  }

  // 6. Render nội dung khi đã có metadata
  const rawImage = (eventJSON?.coverImage || eventJSON?.image || '') as string;
  const coverImageCid = rawImage.startsWith('ipfs://')
    ? rawImage.replace(/^ipfs:\/\//, '')
    : rawImage;

  const name = eventJSON?.name ?? '';
  const location = eventJSON?.location ?? '';
  const formattedDate = formatEventTimestamp(Number(eventEndTime));

  const handleCardClick = () => {
    navigate(`/eventResale/${eventAddress}`);
  };

  return (
    <div
      className={`event-card${isSoldOut ? ' sold-out' : ''}`}
      onClick={handleCardClick}
    >
      <div className="event-image-container">
        {coverImageCid ? (
          <img
            src={`http://127.0.0.1:8080/ipfs/${coverImageCid}`}
            alt={`${name} cover`}
            className="event-image"
            onError={e => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/placeholder-image.jpg';
              target.alt = 'Image not found';
            }}
          />
        ) : (
          <div className="event-image placeholder">Image Missing</div>
        )}
        {isSoldOut && (
          <div className="sold-out-overlay">
            <span className="sold-out-text">
              Resale
              <hr /> Sold Out
            </span>
          </div>
        )}
      </div>

      <div className="event-card-content">
        <div className="event-title">
          <h3>{name}</h3>
        </div>
        <div className="event-details">
          <p>
            <BsFillCalendarWeekFill
              aria-hidden="true"
              style={{ verticalAlign: '-2px', marginRight: '8px' }}
            />
            {formattedDate}
          </p>
          <p>
            <MdLocationOn
              aria-hidden="true"
              style={{ verticalAlign: '-2px', marginRight: '8px' }}
            />
            {formatLocation(location)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default EventCardResale;
