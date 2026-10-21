import React from 'react';
import { useTranslation } from 'react-i18next';

import { SvgCog, SvgRefresh } from '@actual-app/components/icons/v1';
import { View } from '@actual-app/components/view';

import { useSidebarMenu } from '#hooks/useSidebarMenu';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { Item } from './Item';
import { getSidebarMenuItemPath } from './sidebarMenu';
import { useSidebarMenuItemDetails } from './useSidebarMenuItemDetails';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { sidebarItems } = useSidebarMenu();
  const itemDetails = useSidebarMenuItemDetails();

  return (
    <View data-testid="sidebar-primary-buttons" style={{ flexShrink: 0 }}>
      {sidebarItems.map(item => (
        <Item
          key={item.id}
          title={itemDetails[item.id].title}
          Icon={itemDetails[item.id].Icon}
          to={getSidebarMenuItemPath(item.id, true)}
        />
      ))}
      <Item
        title={t('Subscriptions')}
        Icon={SvgRefresh}
        onClick={() =>
          dispatch(pushModal({ modal: { name: 'subscriptions' } }))
        }
      />
      <Item title={t('Settings')} Icon={SvgCog} to="/settings" />
    </View>
  );
}
